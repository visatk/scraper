// ─── Telegram API Types ───────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  first_name?: string;
  username?: string;
}

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
}

export interface EditMessageParams {
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

export interface AnswerCallbackParams {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}
