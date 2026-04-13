import { TelegramBot } from "../telegram/bot";
import { Database } from "../storage/db";
import { Cache } from "../storage/cache";
import { BrowserRenderingClient } from "../scraper/client";
import { TEMPLATES, AI_MODELS, getTemplate } from "../scraper/templates";
import { generateJobId } from "../telegram/webhook";
import {
  welcomeMessage,
  helpMessage,
  formatJobCard,
  formatJobDetail,
  formatResultAsJSON,
  parseURL,
  esc,
  truncate,
} from "../utils/format";
import {
  templatePickerKeyboard,
  modelPickerKeyboard,
  jobActionsKeyboard,
  historyKeyboard,
  keysKeyboard,
  confirmKeyboard,
} from "../utils/keyboards";
import type { TelegramMessage, TelegramCallbackQuery } from "../telegram/types";
import type { Env } from "../index";

const PAGE_SIZE = 5;

export class CommandHandlers {
  private readonly bot: TelegramBot;
  private readonly db: Database;
  private readonly cache: Cache;
  private readonly scraper: BrowserRenderingClient;

  constructor(env: Env) {
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
    this.db = new Database(env.DB);
    this.cache = new Cache(env.KV);
    this.scraper = new BrowserRenderingClient(env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
  }

  // ── /start ─────────────────────────────────────────────────────────────────

  async handleStart(msg: TelegramMessage): Promise<void> {
    const user = msg.from!;
    await this.db.upsertUser(user.id, user.first_name, user.username);
    await this.bot.sendHTML(msg.chat.id, welcomeMessage(user.first_name));
  }

  // ── /help ──────────────────────────────────────────────────────────────────

  async handleHelp(msg: TelegramMessage): Promise<void> {
    await this.bot.sendHTML(msg.chat.id, helpMessage());
  }

  // ── /scrape <url> [prompt] ─────────────────────────────────────────────────

  async handleScrape(msg: TelegramMessage, args: string): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    if (!args.trim()) {
      await this.bot.sendHTML(
        chatId,
        `⚠️ Usage: <code>/scrape &lt;url&gt; [optional prompt]</code>\n\nExample:\n<code>/scrape https://example.com/product Get the product name and price</code>`
      );
      return;
    }

    const parts = args.trim().split(/\s+/);
    const rawUrl = parts[0];
    const prompt = parts.slice(1).join(" ") || null;

    const url = parseURL(rawUrl);
    if (!url) {
      await this.bot.sendHTML(chatId, `❌ Invalid URL: <code>${esc(rawUrl)}</code>`);
      return;
    }

    await this.enqueueScrapeJob(chatId, userId, { url, prompt, templateId: null });
  }

  // ── /extract <url> — show template picker ─────────────────────────────────

  async handleExtract(msg: TelegramMessage, args: string): Promise<void> {
    const chatId = msg.chat.id;

    const url = parseURL(args.trim());
    if (!url) {
      await this.bot.sendHTML(
        chatId,
        `⚠️ Usage: <code>/extract &lt;url&gt;</code>\n\nI'll then show you schema templates to choose from.`
      );
      return;
    }

    // Store URL in session, show picker
    const jobId = generateJobId();
    await this.cache.setSessionState(msg.from!.id, { pendingUrl: url, pendingJobId: jobId });

    await this.bot.sendHTML(
      chatId,
      `🌐 <b>URL:</b> <a href="${esc(url)}">${esc(truncate(url, 60))}</a>\n\nChoose an extraction template:`,
      templatePickerKeyboard(jobId)
    );
  }

  // ── Plain URL message ─────────────────────────────────────────────────────

  async handlePlainURL(msg: TelegramMessage, url: string): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;
    await this.enqueueScrapeJob(chatId, userId, { url, prompt: null, templateId: null });
  }

  // ── /history [page] ────────────────────────────────────────────────────────

  async handleHistory(msg: TelegramMessage, pageArg?: string): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;
    const page = parseInt(pageArg ?? "0", 10) || 0;

    const [jobs, total] = await Promise.all([
      this.db.getUserJobs(userId, PAGE_SIZE, page * PAGE_SIZE),
      this.db.countUserJobs(userId),
    ]);

    if (jobs.length === 0 && page === 0) {
      await this.bot.sendHTML(
        chatId,
        `📭 No jobs yet.\n\nSend any URL or use <code>/scrape &lt;url&gt;</code> to get started.`
      );
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const cards = jobs.map((j, i) => formatJobCard(j, page * PAGE_SIZE + i)).join("\n\n─────────────\n\n");

    await this.bot.sendHTML(
      chatId,
      `📋 <b>Your Scrape History</b> (${total} total)\n\n${cards}`,
      historyKeyboard(jobs, page, totalPages)
    );
  }

  // ── /job <id> ──────────────────────────────────────────────────────────────

  async handleJob(msg: TelegramMessage, jobId: string): Promise<void> {
    const chatId = msg.chat.id;

    if (!jobId) {
      await this.bot.sendHTML(chatId, `⚠️ Usage: <code>/job &lt;JOB_ID&gt;</code>`);
      return;
    }

    const job = await this.db.getJob(jobId.toUpperCase());
    if (!job) {
      await this.bot.sendHTML(chatId, `❌ Job <code>${esc(jobId)}</code> not found.`);
      return;
    }

    await this.bot.sendHTML(
      chatId,
      formatJobDetail(job),
      job.status === "done" ? jobActionsKeyboard(job.id, job.url) : undefined
    );
  }

  // ── /export <id> ──────────────────────────────────────────────────────────

  async handleExport(msg: TelegramMessage, jobId: string): Promise<void> {
    const chatId = msg.chat.id;

    const job = await this.db.getJob(jobId.toUpperCase());
    if (!job || job.status !== "done" || !job.result_json) {
      await this.bot.sendHTML(chatId, `❌ Job not found or has no results.`);
      return;
    }

    // Send as document via multipart
    await this.sendJSONFile(chatId, job.result_json, `nexus_${job.id}.json`);
  }

  // ── /model ────────────────────────────────────────────────────────────────

  async handleModel(msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const user = await this.db.getUser(msg.from!.id);
    const currentModel = user?.model ?? "workers_ai";

    await this.bot.sendHTML(
      chatId,
      `🤖 <b>Select AI Model</b>\n\nCurrent: <b>${AI_MODELS.find((m) => m.id === currentModel)?.name}</b>\n\n` +
        AI_MODELS.map((m) => `${m.emoji} <b>${m.name}</b>\n<i>${m.description}</i>`).join("\n\n"),
      modelPickerKeyboard(currentModel)
    );
  }

  // ── /keys ──────────────────────────────────────────────────────────────────

  async handleKeys(msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const user = await this.db.getUser(msg.from!.id);

    await this.bot.sendHTML(
      chatId,
      `🔑 <b>API Keys</b>\n\nCustom API keys enable Claude Sonnet 4 and GPT-4o models.\nKeys are stored encrypted and never shared.\n\n` +
        `Anthropic: ${user?.anthropic_key ? "✅ Set" : "❌ Not set"}\n` +
        `OpenAI: ${user?.openai_key ? "✅ Set" : "❌ Not set"}`,
      keysKeyboard(!!user?.anthropic_key, !!user?.openai_key)
    );
  }

  // ── /quota ────────────────────────────────────────────────────────────────

  async handleQuota(msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const user = await this.db.getUser(msg.from!.id);

    if (!user) {
      await this.bot.sendHTML(chatId, `❌ User not found. Use /start first.`);
      return;
    }

    const dailyLimit = user.is_admin ? "∞" : "50";
    const bar = makeProgressBar(user.jobs_today, 50);

    await this.bot.sendHTML(
      chatId,
      `📊 <b>Your Usage Quota</b>\n\n` +
        `<b>Today:</b> ${user.jobs_today} / ${dailyLimit} jobs\n` +
        `${bar}\n\n` +
        `<b>Total Jobs:</b> ${user.total_jobs}\n` +
        `<b>Model:</b> ${AI_MODELS.find((m) => m.id === user.model)?.name ?? user.model}\n` +
        `<b>Anthropic Key:</b> ${user.anthropic_key ? "✅" : "❌"}\n` +
        `<b>OpenAI Key:</b> ${user.openai_key ? "✅" : "❌"}\n\n` +
        `Rate limit: 5 jobs per minute`
    );
  }

  // ── Core: Enqueue a Scrape Job ─────────────────────────────────────────────

  async enqueueScrapeJob(
    chatId: number,
    userId: number,
    params: { url: string; prompt: string | null; templateId: string | null; schemaJson?: string | null }
  ): Promise<void> {
    // Rate limit check
    const rl = await this.cache.checkRateLimit(userId);
    if (!rl.allowed) {
      await this.bot.sendHTML(
        chatId,
        `⏱ <b>Rate Limited</b>\n\nYou're moving too fast! Please wait <b>${rl.resetIn}s</b> before your next scrape.`
      );
      return;
    }

    const user = await this.db.getUser(userId);
    if (!user) {
      await this.bot.sendHTML(chatId, `❌ Please use /start first.`);
      return;
    }

    if (!user.is_admin && user.jobs_today >= 50) {
      await this.bot.sendHTML(
        chatId,
        `🚫 <b>Daily Limit Reached</b>\n\nYou've used all 50 daily scrapes. Limit resets at midnight UTC.`
      );
      return;
    }

    const jobId = generateJobId();
    const template = params.templateId ? getTemplate(params.templateId) : null;

    // Create job record
    await this.db.createJob({
      id: jobId,
      userId: user.id,
      url: params.url,
      prompt: params.prompt ?? template?.prompt ?? null,
      templateId: params.templateId,
      schemaJson: params.schemaJson ?? (template ? JSON.stringify(template.schema) : null),
      model: user.model,
    });

    await this.db.incrementJobCount(userId);

    // Send "processing" message
    const progressMsg = await this.bot.sendHTML(
      chatId,
      `⚙️ <b>Scraping...</b> <code>${jobId}</code>\n\n` +
        `🌐 ${esc(truncate(params.url, 60))}\n` +
        `📋 ${template ? `${template.emoji} ${template.name}` : params.prompt ? "Custom prompt" : "Auto-extract"}\n` +
        `🤖 ${AI_MODELS.find((m) => m.id === user.model)?.name ?? user.model}\n\n` +
        `<i>This may take 10–30 seconds...</i>`
    );

    // Store pending message for queue consumer to update
    await this.cache.setPendingMessage(jobId, chatId, progressMsg.message_id);

    // Enqueue
    // Build custom_ai array if needed
    const customAi = buildCustomAi(user.model, user.anthropic_key, user.openai_key);

    await this.processJobInline(jobId, params.url, {
      prompt: params.prompt ?? template?.prompt ?? "Extract all relevant structured information from this page.",
      schema: template?.schema ?? (params.schemaJson ? JSON.parse(params.schemaJson) : undefined),
      waitUntil: template?.waitUntil,
      customAi,
      chatId,
      messageId: progressMsg.message_id,
      model: user.model,
    });
  }

  // Process synchronously within the same request (using waitUntil for background)
  async processJobInline(
    jobId: string,
    url: string,
    opts: {
      prompt: string;
      schema?: Record<string, unknown>;
      waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
      customAi?: Array<{ model: string; authorization: string }>;
      chatId: number;
      messageId: number;
      model: string;
    }
  ): Promise<void> {
    await this.db.updateJobStatus(jobId, "processing");

    const result = await this.scraper.scrapeJSON({
      url,
      prompt: opts.prompt,
      schema: opts.schema,
      waitUntil: opts.waitUntil,
      custom_ai: opts.customAi,
    });

    if (result.success && result.data) {
      const resultJson = JSON.stringify(result.data);
      await this.db.updateJobStatus(jobId, "done", {
        json: resultJson,
        durationMs: result.durationMs,
      });

      const preview = JSON.stringify(result.data, null, 2);
      const truncated = preview.length > 2000 ? preview.slice(0, 2000) + "\n…(truncated)" : preview;

      await this.bot.editHTML(
        opts.chatId,
        opts.messageId,
        `✅ <b>Extraction Complete</b> <code>${jobId}</code>\n\n` +
          `⏱ ${result.durationMs}ms\n\n` +
          `<pre>${esc(truncated)}</pre>`,
        jobActionsKeyboard(jobId, url)
      );
    } else {
      await this.db.updateJobStatus(jobId, "failed", {
        error: result.error,
        durationMs: result.durationMs,
      });

      await this.bot.editHTML(
        opts.chatId,
        opts.messageId,
        `❌ <b>Extraction Failed</b> <code>${jobId}</code>\n\n` +
          `<b>Error:</b> <code>${esc(result.error ?? "Unknown error")}</code>\n\n` +
          `💡 Try:\n• Using a template instead of auto-extract\n• Adding <code>networkidle2</code> wait\n• Switching to Claude Sonnet 4 for better accuracy`,
        confirmKeyboard(`retry:${jobId}`, "cancel")
      );
    }

    await this.cache.clearPendingMessage(jobId);
  }

  // ── File Upload Helper ────────────────────────────────────────────────────

  private async sendJSONFile(chatId: number, json: string, filename: string): Promise<void> {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(
      "document",
      new Blob([json], { type: "application/json" }),
      filename
    );
    formData.append("caption", `📥 ${filename}`);

    await fetch(`https://api.telegram.org/bot${this.getBotToken()}/sendDocument`, {
      method: "POST",
      body: formData,
    });
  }

  private getBotToken(): string {
    // Accessed via env in the constructor chain
    return (this.bot as unknown as { token: string }).token;
  }
}

// ── Callback Query Handler ─────────────────────────────────────────────────

export class CallbackHandlers {
  private readonly bot: TelegramBot;
  private readonly db: Database;
  private readonly cache: Cache;
  private readonly commands: CommandHandlers;

  constructor(env: Env) {
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
    this.db = new Database(env.DB);
    this.cache = new Cache(env.KV);
    this.commands = new CommandHandlers(env);
  }

  async handle(query: TelegramCallbackQuery, env: Env): Promise<void> {
    const data = query.data ?? "";
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const userId = query.from.id;

    await this.bot.answerCallback({ callback_query_id: query.id });

    if (!chatId || !messageId) return;

    // ── Template selected ──────────────────────────────────────────────────
    if (data.startsWith("tpl:")) {
      const [, templateId] = data.split(":");
      const session = await this.cache.getSessionState(userId);
      const url = session?.pendingUrl as string | undefined;

      if (!url) {
        await this.bot.editHTML(chatId, messageId, `❌ Session expired. Please use /extract again.`);
        return;
      }

      const template = getTemplate(templateId);
      if (!template) {
        await this.bot.editHTML(chatId, messageId, `❌ Unknown template.`);
        return;
      }

      await this.cache.clearSessionState(userId);
      await this.bot.editHTML(
        chatId,
        messageId,
        `${template.emoji} <b>${template.name}</b> selected\n🌐 ${esc(truncate(url, 60))}\n\n⚙️ Starting extraction...`
      );

      await this.commands.enqueueScrapeJob(chatId, userId, {
        url,
        prompt: template.prompt,
        templateId,
        schemaJson: JSON.stringify(template.schema),
      });
      return;
    }

    // ── Model switch ───────────────────────────────────────────────────────
    if (data.startsWith("model:")) {
      const modelId = data.split(":")[1] as "workers_ai" | "claude_sonnet" | "gpt4o";
      const model = AI_MODELS.find((m) => m.id === modelId);

      if (!model) return;

      // Check if key is needed
      if (modelId !== "workers_ai") {
        const user = await this.db.getUser(userId);
        const needsKey = modelId === "claude_sonnet" ? !user?.anthropic_key : !user?.openai_key;
        if (needsKey) {
          await this.bot.editHTML(
            chatId,
            messageId,
            `🔑 <b>${model.name}</b> requires an API key.\n\nUse /keys to set your ${modelId === "claude_sonnet" ? "Anthropic" : "OpenAI"} API key first.`
          );
          return;
        }
      }

      await this.db.setUserModel(userId, modelId);
      await this.bot.editHTML(
        chatId,
        messageId,
        `✅ Model switched to <b>${model.emoji} ${model.name}</b>`,
        modelPickerKeyboard(modelId)
      );
      return;
    }

    // ── Export ─────────────────────────────────────────────────────────────
    if (data.startsWith("export:")) {
      const jobId = data.split(":")[1];
      const job = await this.db.getJob(jobId);
      if (!job?.result_json) {
        await this.bot.answerCallback({ callback_query_id: query.id, text: "No result to export." });
        return;
      }

      const formData = new FormData();
      formData.append("chat_id", String(chatId));
      formData.append(
        "document",
        new Blob([job.result_json], { type: "application/json" }),
        `nexus_${jobId}.json`
      );
      formData.append("caption", `📥 <b>Export:</b> <code>${jobId}</code>`, );
      formData.append("parse_mode", "HTML");

      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: "POST",
        body: formData,
      });
      return;
    }

    // ── Job detail ─────────────────────────────────────────────────────────
    if (data.startsWith("job:")) {
      const jobId = data.split(":")[1];
      const job = await this.db.getJob(jobId);
      if (!job) {
        await this.bot.editHTML(chatId, messageId, `❌ Job not found.`);
        return;
      }
      await this.bot.editHTML(
        chatId,
        messageId,
        formatJobDetail(job),
        job.status === "done" ? jobActionsKeyboard(job.id, job.url) : undefined
      );
      return;
    }

    // ── History pagination ─────────────────────────────────────────────────
    if (data.startsWith("history:")) {
      const page = parseInt(data.split(":")[1], 10) || 0;
      const [jobs, total] = await Promise.all([
        this.db.getUserJobs(userId, PAGE_SIZE, page * PAGE_SIZE),
        this.db.countUserJobs(userId),
      ]);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const cards = jobs.map((j, i) => formatJobCard(j, page * PAGE_SIZE + i)).join("\n\n─────────────\n\n");

      await this.bot.editHTML(
        chatId,
        messageId,
        `📋 <b>Your Scrape History</b> (${total} total)\n\n${cards || "<i>No jobs yet.</i>"}`,
        historyKeyboard(jobs, page, totalPages)
      );
      return;
    }

    // ── Re-scrape ──────────────────────────────────────────────────────────
    if (data.startsWith("rescrape:")) {
      const jobId = data.split(":")[1];
      const job = await this.db.getJob(jobId);
      if (!job) return;

      await this.bot.editHTML(chatId, messageId, `🔄 Re-queuing job...\n<code>${jobId}</code>`);

      await this.commands.enqueueScrapeJob(chatId, userId, {
        url: job.url,
        prompt: job.prompt,
        templateId: job.template_id,
        schemaJson: job.schema_json,
      });
      return;
    }

    // ── Key management ─────────────────────────────────────────────────────
    if (data.startsWith("key:set:")) {
      const provider = data.split(":")[2] as "anthropic" | "openai";
      await this.cache.setSessionState(userId, { awaitingKey: provider });
      await this.bot.editHTML(
        chatId,
        messageId,
        `🔑 <b>Set ${provider === "anthropic" ? "Anthropic" : "OpenAI"} API Key</b>\n\n` +
          `Please send your API key as the next message.\n\n` +
          `<i>Your key will be stored securely and used only for your scrape requests.</i>\n\n` +
          `⚠️ <b>Delete this message after sending your key for security.</b>`
      );
      return;
    }

    if (data.startsWith("key:del:")) {
      const provider = data.split(":")[2] as "anthropic" | "openai";
      await this.db.setUserKey(userId, provider, null);
      const user = await this.db.getUser(userId);
      await this.bot.editHTML(
        chatId,
        messageId,
        `✅ ${provider === "anthropic" ? "Anthropic" : "OpenAI"} key removed.`,
        keysKeyboard(!!user?.anthropic_key, !!user?.openai_key)
      );
      return;
    }

    // ── Cancel / noop ──────────────────────────────────────────────────────
    if (data === "cancel") {
      await this.cache.clearSessionState(userId);
      await this.bot.deleteMessage(chatId, messageId);
      return;
    }
  }
}

// ── Awaiting Key Input ─────────────────────────────────────────────────────

export async function handleAwaitingKeyInput(
  msg: TelegramMessage,
  provider: "anthropic" | "openai",
  env: Env
): Promise<void> {
  const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
  const db = new Database(env.DB);
  const cache = new Cache(env.KV);
  const key = msg.text?.trim() ?? "";

  if (!key.startsWith("sk-")) {
    await bot.sendHTML(
      msg.chat.id,
      `❌ Invalid API key format. Expected key starting with <code>sk-</code>.`
    );
    return;
  }

  await db.setUserKey(msg.from!.id, provider, key);
  await cache.clearSessionState(msg.from!.id);

  // Delete user's key message for security
  await bot.deleteMessage(msg.chat.id, msg.message_id);

  await bot.sendHTML(
    msg.chat.id,
    `✅ <b>${provider === "anthropic" ? "Anthropic" : "OpenAI"} key saved!</b>\n\n` +
      `You can now use <b>/model</b> to switch to ${provider === "anthropic" ? "Claude Sonnet 4" : "GPT-4o"}.`
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildCustomAi(
  model: string,
  anthropicKey: string | null,
  openaiKey: string | null
): Array<{ model: string; authorization: string }> | undefined {
  if (model === "claude_sonnet" && anthropicKey) {
    return [
      { model: "anthropic/claude-sonnet-4-20250514", authorization: `Bearer ${anthropicKey}` },
      // Fallback to Workers AI
      {
        model: "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        authorization: `Bearer fallback`,
      },
    ];
  }
  if (model === "gpt4o" && openaiKey) {
    return [
      { model: "openai/gpt-4o", authorization: `Bearer ${openaiKey}` },
      {
        model: "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        authorization: `Bearer fallback`,
      },
    ];
  }
  return undefined; // Use default Workers AI
}

function makeProgressBar(used: number, total: number): string {
  const pct = Math.min(used / total, 1);
  const filled = Math.round(pct * 10);
  return `[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${Math.round(pct * 100)}%`;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
