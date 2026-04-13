import type { Job } from "../storage/db";
import { TEMPLATES } from "../scraper/templates";

// Escape HTML special chars for Telegram HTML mode
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatJobStatus(status: Job["status"]): string {
  const map: Record<Job["status"], string> = {
    queued: "⏳ Queued",
    processing: "⚙️ Processing",
    done: "✅ Done",
    failed: "❌ Failed",
  };
  return map[status];
}

export function formatModelName(model: Job["model"]): string {
  const map: Record<Job["model"], string> = {
    workers_ai: "☁️ Workers AI",
    claude_sonnet: "🧠 Claude Sonnet 4",
    gpt4o: "🤖 GPT-4o",
  };
  return map[model];
}

export function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

export function formatJobCard(job: Job, index?: number): string {
  const templateName = job.template_id
    ? TEMPLATES.find((t) => t.id === job.template_id)?.name ?? job.template_id
    : "Custom prompt";

  const prefix = index !== undefined ? `<b>${index + 1}.</b> ` : "";

  return (
    `${prefix}<code>${job.id}</code> · ${formatJobStatus(job.status)}\n` +
    `🌐 <a href="${esc(job.url)}">${esc(truncate(job.url, 50))}</a>\n` +
    `📋 ${esc(templateName)} · ${formatModelName(job.model)}\n` +
    `🕒 ${formatDate(job.created_at)} · ⏱ ${formatDuration(job.duration_ms)}`
  );
}

export function formatJobDetail(job: Job): string {
  const lines: string[] = [
    `<b>🔍 Scrape Job</b> <code>${job.id}</code>`,
    ``,
    `<b>URL:</b> <a href="${esc(job.url)}">${esc(truncate(job.url, 80))}</a>`,
    `<b>Status:</b> ${formatJobStatus(job.status)}`,
    `<b>Model:</b> ${formatModelName(job.model)}`,
    `<b>Created:</b> ${formatDate(job.created_at)}`,
  ];

  if (job.completed_at) {
    lines.push(`<b>Completed:</b> ${formatDate(job.completed_at)}`);
  }

  if (job.duration_ms) {
    lines.push(`<b>Duration:</b> ${formatDuration(job.duration_ms)}`);
  }

  if (job.template_id) {
    const tmpl = TEMPLATES.find((t) => t.id === job.template_id);
    lines.push(`<b>Template:</b> ${tmpl ? `${tmpl.emoji} ${tmpl.name}` : job.template_id}`);
  }

  if (job.prompt) {
    lines.push(`<b>Prompt:</b> <i>${esc(truncate(job.prompt, 100))}</i>`);
  }

  if (job.status === "done" && job.result_json) {
    try {
      const parsed = JSON.parse(job.result_json);
      const preview = JSON.stringify(parsed, null, 2);
      const truncated = preview.length > 1500 ? preview.slice(0, 1500) + "\n... (truncated)" : preview;
      lines.push(``, `<b>Result Preview:</b>`, `<pre>${esc(truncated)}</pre>`);
    } catch {
      lines.push(`<b>Result:</b> <i>(parse error)</i>`);
    }
  }

  if (job.status === "failed" && job.error) {
    lines.push(``, `<b>Error:</b> <code>${esc(truncate(job.error, 300))}</code>`);
  }

  return lines.join("\n");
}

export function formatResultAsJSON(result: unknown): string {
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

export function parseURL(text: string): string | null {
  try {
    const trimmed = text.trim();
    const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    new URL(url); // validates
    return url;
  } catch {
    return null;
  }
}

// ── Welcome & Help Messages ────────────────────────────────────────────────

export function welcomeMessage(firstName: string): string {
  return (
    `🕷️ <b>NexusScraper</b> — AI Web Extraction\n\n` +
    `Welcome, <b>${esc(firstName)}</b>! I extract structured data from any webpage using AI.\n\n` +
    `<b>Quick Start:</b>\n` +
    `• Send me any URL to get started\n` +
    `• Use /scrape to extract with a custom prompt\n` +
    `• Use /extract to pick a smart template\n\n` +
    `<b>Commands:</b>\n` +
    `/scrape <code>&lt;url&gt;</code> — AI scrape with auto-prompt\n` +
    `/extract <code>&lt;url&gt;</code> — Choose a schema template\n` +
    `/history — View your recent jobs\n` +
    `/model — Switch AI model\n` +
    `/keys — Manage API keys\n` +
    `/quota — Your usage stats\n` +
    `/help — Full command list`
  );
}

export function helpMessage(): string {
  return (
    `🕷️ <b>Commands</b>\n\n` +
    `<b>Scraping:</b>\n` +
    `/scrape <code>&lt;url&gt; [prompt]</code>\n` +
    `  → AI-powered extraction with optional prompt\n\n` +
    `/extract <code>&lt;url&gt;</code>\n` +
    `  → Choose from 8 smart schema templates\n\n` +
    `/job <code>&lt;id&gt;</code>\n` +
    `  → View job details and results\n\n` +
    `/export <code>&lt;id&gt;</code>\n` +
    `  → Download result as JSON file\n\n` +
    `<b>Configuration:</b>\n` +
    `/model — Switch AI extraction model\n` +
    `/keys — Set custom API keys (Claude/GPT-4o)\n` +
    `/quota — View daily usage & limits\n\n` +
    `<b>History:</b>\n` +
    `/history — Recent scrape jobs\n\n` +
    `<b>Tips:</b>\n` +
    `• Just send a URL — I'll start scraping automatically\n` +
    `• Use Claude Sonnet 4 for complex or dynamic pages\n` +
    `• Templates guarantee structured, typed output`
  );
}
