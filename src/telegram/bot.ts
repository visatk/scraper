import type {
  SendMessageParams,
  EditMessageParams,
  AnswerCallbackParams,
  InlineKeyboardMarkup,
} from "./types";

export class TelegramBot {
  private readonly apiBase: string;

  constructor(private readonly token: string) {
    this.apiBase = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API error [${method}]: ${data.description}`);
    }
    return data.result;
  }

  async sendMessage(params: SendMessageParams): Promise<{ message_id: number }> {
    return this.call("sendMessage", {
      ...params,
      disable_web_page_preview: params.disable_web_page_preview ?? true,
    });
  }

  async editMessage(params: EditMessageParams): Promise<void> {
    await this.call("editMessageText", {
      ...params,
      disable_web_page_preview: params.disable_web_page_preview ?? true,
    }).catch(() => {
      // Ignore "message is not modified" errors
    });
  }

  async answerCallback(params: AnswerCallbackParams): Promise<void> {
    await this.call("answerCallbackQuery", params);
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.call("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => {});
  }

  async sendChatAction(chatId: number, action: string): Promise<void> {
    await this.call("sendChatAction", { chat_id: chatId, action });
  }

  // ── Convenience helpers ──────────────────────────────────────────────────

  async sendHTML(
    chatId: number,
    text: string,
    markup?: InlineKeyboardMarkup
  ): Promise<{ message_id: number }> {
    return this.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: markup,
    });
  }

  async editHTML(
    chatId: number,
    messageId: number,
    text: string,
    markup?: InlineKeyboardMarkup
  ): Promise<void> {
    return this.editMessage({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: markup,
    });
  }

  // Paginated text split for Telegram's 4096 char limit
  async sendLongMessage(chatId: number, text: string): Promise<void> {
    const MAX = 4000;
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > MAX) {
      let split = remaining.lastIndexOf("\n", MAX);
      if (split === -1) split = MAX;
      chunks.push(remaining.slice(0, split));
      remaining = remaining.slice(split).trimStart();
    }
    if (remaining) chunks.push(remaining);

    for (const chunk of chunks) {
      await this.sendHTML(chatId, chunk);
    }
  }
}
