import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import { TelegramBot } from "./telegram/bot";
import { verifyWebhookSecret } from "./telegram/webhook";
import { CommandHandlers, CallbackHandlers, handleAwaitingKeyInput } from "./handlers/commands";
import { Cache } from "./storage/cache";
import { Database } from "./storage/db";
import { parseURL } from "./utils/format";
import type { TelegramUpdate } from "./telegram/types";

// ── Environment bindings (generated via `wrangler types`) ─────────────────
export interface Env {
  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string; // Browser Rendering + Workers AI token

  // Bindings
  DB: D1Database;
  KV: KVNamespace;
}

// ── Worker export ──────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── Health check ───────────────────────────────────────────────────────
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", ts: new Date().toISOString() });
    }

    // ── Webhook setup endpoint ─────────────────────────────────────────────
    if (url.pathname === "/setup" && request.method === "GET") {
      return handleSetup(request, env);
    }

    // ── Telegram webhook ───────────────────────────────────────────────────
    if (url.pathname === "/webhook" && request.method === "POST") {
      // Verify secret
      if (!verifyWebhookSecret(request, env.WEBHOOK_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const update = (await request.json()) as TelegramUpdate;

      // Process webhook — use waitUntil so Telegram gets 200 immediately
      // while we process asynchronously
      ctx.waitUntil(handleUpdate(update, env));

      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ── Update Router ──────────────────────────────────────────────────────────

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  try {
    if (update.callback_query) {
      const cbHandlers = new CallbackHandlers(env);
      await cbHandlers.handle(update.callback_query, env);
      return;
    }

    if (!update.message?.text) return;

    const msg = update.message;
    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) return;

    const handlers = new CommandHandlers(env);
    const cache = new Cache(env.KV);
    const db = new Database(env.DB);

    // ── Check session state (e.g., awaiting API key) ───────────────────────
    const session = await cache.getSessionState(userId);

    if (session?.awaitingKey) {
      await handleAwaitingKeyInput(
        msg,
        session.awaitingKey as "anthropic" | "openai",
        env
      );
      return;
    }

    // ── Command routing ────────────────────────────────────────────────────
    if (text.startsWith("/")) {
      const [rawCmd, ...argParts] = text.split(/\s+/);
      const cmd = rawCmd.replace(/@\w+$/, "").toLowerCase(); // strip @botname
      const args = argParts.join(" ");

      switch (cmd) {
        case "/start":
          await handlers.handleStart(msg);
          break;

        case "/help":
          await handlers.handleHelp(msg);
          break;

        case "/scrape":
          await handlers.handleScrape(msg, args);
          break;

        case "/extract":
          await handlers.handleExtract(msg, args);
          break;

        case "/history": {
          const page = parseInt(args, 10) || 0;
          await handlers.handleHistory(msg, String(page));
          break;
        }

        case "/job":
          await handlers.handleJob(msg, args.toUpperCase());
          break;

        case "/export":
          await handlers.handleExport(msg, args.toUpperCase());
          break;

        case "/model":
          await handlers.handleModel(msg);
          break;

        case "/keys":
          await handlers.handleKeys(msg);
          break;

        case "/quota":
          await handlers.handleQuota(msg);
          break;

        default: {
          const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
          await bot.sendHTML(
            chatId,
            `❓ Unknown command. Use /help to see all available commands.`
          );
        }
      }
      return;
    }

    // ── Plain text — check if it's a URL ──────────────────────────────────
    const maybeUrl = parseURL(text);
    if (maybeUrl) {
      await handlers.handlePlainURL(msg, maybeUrl);
      return;
    }

    // ── Unknown input ──────────────────────────────────────────────────────
    const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
    await bot.sendHTML(
      chatId,
      `💡 Send me a URL to scrape it, or use /help to see all commands.\n\nExample:\n<code>https://example.com/product</code>`
    );
  } catch (err) {
    console.error("handleUpdate error:", err);
    // Don't rethrow — we've already sent 200 to Telegram
  }
}

// ── Webhook Registration Helper ────────────────────────────────────────────

async function handleSetup(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const workerUrl = new URL(request.url);
  const webhookUrl = `${workerUrl.origin}/webhook`;

  // Register webhook with Telegram
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    }
  );

  const data = await res.json();

  // Set bot commands
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Start the bot & onboarding" },
          { command: "scrape", description: "Scrape URL with AI — /scrape <url> [prompt]" },
          { command: "extract", description: "Extract with schema template — /extract <url>" },
          { command: "history", description: "View your recent scrape jobs" },
          { command: "job", description: "View job details — /job <id>" },
          { command: "export", description: "Download results as JSON — /export <id>" },
          { command: "model", description: "Switch AI model (Workers AI / Claude / GPT-4o)" },
          { command: "keys", description: "Manage API keys for premium models" },
          { command: "quota", description: "Check your usage quota" },
          { command: "help", description: "Full command reference" },
        ],
      }),
    }
  );

  return Response.json({
    webhook_url: webhookUrl,
    telegram_response: data,
  });
}
