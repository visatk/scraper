import type { InlineKeyboardMarkup, InlineKeyboardButton } from "../telegram/types";
import { TEMPLATES, AI_MODELS } from "../scraper/templates";

export function kb(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

export function btn(text: string, data: string): InlineKeyboardButton {
  return { text, callback_data: data };
}

export function urlBtn(text: string, url: string): InlineKeyboardButton {
  return { text, url };
}

// ── Template Picker ────────────────────────────────────────────────────────

export function templatePickerKeyboard(jobId: string): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [];

  // 2 per row
  for (let i = 0; i < TEMPLATES.length; i += 2) {
    const row: InlineKeyboardButton[] = [
      btn(`${TEMPLATES[i].emoji} ${TEMPLATES[i].name}`, `tpl:${TEMPLATES[i].id}:${jobId}`),
    ];
    if (TEMPLATES[i + 1]) {
      row.push(btn(`${TEMPLATES[i + 1].emoji} ${TEMPLATES[i + 1].name}`, `tpl:${TEMPLATES[i + 1].id}:${jobId}`));
    }
    rows.push(row);
  }

  rows.push([btn("❌ Cancel", "cancel")]);
  return kb(rows);
}

// ── Model Picker ───────────────────────────────────────────────────────────

export function modelPickerKeyboard(currentModel: string): InlineKeyboardMarkup {
  return kb([
    ...AI_MODELS.map((m) => [
      btn(
        `${m.emoji} ${m.name}${m.id === currentModel ? " ✓" : ""}`,
        `model:${m.id}`
      ),
    ]),
    [btn("❌ Close", "cancel")],
  ]);
}

// ── Job Result Actions ─────────────────────────────────────────────────────

export function jobActionsKeyboard(jobId: string, url: string): InlineKeyboardMarkup {
  return kb([
    [
      btn("📥 Export JSON", `export:${jobId}`),
      btn("🔄 Re-scrape", `rescrape:${jobId}`),
    ],
    [
      urlBtn("🌐 Open URL", url),
      btn("🗑 Delete Job", `delete:${jobId}`),
    ],
    [btn("◀️ History", "history:0")],
  ]);
}

// ── History Navigation ─────────────────────────────────────────────────────

export function historyKeyboard(
  jobs: Array<{ id: string }>,
  page: number,
  totalPages: number
): InlineKeyboardMarkup {
  const navRow: InlineKeyboardButton[] = [];

  if (page > 0) {
    navRow.push(btn("◀️ Prev", `history:${page - 1}`));
  }

  navRow.push(btn(`${page + 1} / ${totalPages}`, "noop"));

  if (page < totalPages - 1) {
    navRow.push(btn("Next ▶️", `history:${page + 1}`));
  }

  return kb([
    ...jobs.map((j) => [btn(`🔍 ${j.id}`, `job:${j.id}`)]),
    navRow,
    [btn("🔄 Refresh", `history:${page}`)],
  ]);
}

// ── Confirmation ───────────────────────────────────────────────────────────

export function confirmKeyboard(yesData: string, noData = "cancel"): InlineKeyboardMarkup {
  return kb([[btn("✅ Yes", yesData), btn("❌ No", noData)]]);
}

// ── Quick Scrape Prompt ────────────────────────────────────────────────────

export function quickScrapeKeyboard(url: string): InlineKeyboardMarkup {
  // Encode URL safely for callback data (limited to 64 bytes by Telegram)
  const urlKey = btoa(url).slice(0, 30);
  return kb([
    [
      btn("🚀 Quick Extract", `quick:${urlKey}`),
      btn("📋 Pick Template", `pick:${urlKey}`),
    ],
    [btn("❌ Cancel", "cancel")],
  ]);
}

// ── Key Setup ─────────────────────────────────────────────────────────────

export function keysKeyboard(hasAnthropic: boolean, hasOpenAI: boolean): InlineKeyboardMarkup {
  return kb([
    [btn(`${hasAnthropic ? "🔑✓" : "🔑"} Set Anthropic Key`, "key:set:anthropic")],
    [btn(`${hasOpenAI ? "🔑✓" : "🔑"} Set OpenAI Key`, "key:set:openai")],
    ...(hasAnthropic ? [[btn("🗑 Remove Anthropic Key", "key:del:anthropic")]] : []),
    ...(hasOpenAI ? [[btn("🗑 Remove OpenAI Key", "key:del:openai")]] : []),
    [btn("❌ Close", "cancel")],
  ]);
}
