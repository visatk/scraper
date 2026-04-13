import type { D1Database } from "@cloudflare/workers-types";

export type JobStatus = "queued" | "processing" | "done" | "failed";
export type ModelId = "workers_ai" | "claude_sonnet" | "gpt4o";

export interface Job {
  id: string;
  user_id: number;
  url: string;
  prompt: string | null;
  template_id: string | null;
  schema_json: string | null;
  model: ModelId;
  status: JobStatus;
  result_json: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface UserRecord {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  model: ModelId;
  anthropic_key: string | null;
  openai_key: string | null;
  jobs_today: number;
  daily_reset_at: string;
  total_jobs: number;
  is_admin: boolean;
  created_at: string;
}

export interface CustomSchema {
  id: string;
  user_id: number;
  name: string;
  schema_json: string;
  prompt: string | null;
  created_at: string;
}

export class Database {
  constructor(private readonly db: D1Database) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  async upsertUser(
    telegramId: number,
    firstName: string,
    username?: string
  ): Promise<UserRecord> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO users (telegram_id, first_name, username, created_at, daily_reset_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           first_name = excluded.first_name,
           username   = excluded.username`
      )
      .bind(telegramId, firstName, username ?? null, now, now)
      .run();

    return this.getUser(telegramId) as Promise<UserRecord>;
  }

  async getUser(telegramId: number): Promise<UserRecord | null> {
    return this.db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .bind(telegramId)
      .first<UserRecord>();
  }

  async setUserModel(telegramId: number, model: ModelId): Promise<void> {
    await this.db
      .prepare("UPDATE users SET model = ? WHERE telegram_id = ?")
      .bind(model, telegramId)
      .run();
  }

  async setUserKey(
    telegramId: number,
    provider: "anthropic" | "openai",
    key: string | null
  ): Promise<void> {
    const col = provider === "anthropic" ? "anthropic_key" : "openai_key";
    await this.db
      .prepare(`UPDATE users SET ${col} = ? WHERE telegram_id = ?`)
      .bind(key, telegramId)
      .run();
  }

  async incrementJobCount(telegramId: number): Promise<void> {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    await this.db
      .prepare(
        `UPDATE users SET
           total_jobs = total_jobs + 1,
           jobs_today = CASE WHEN daily_reset_at < ? THEN 1 ELSE jobs_today + 1 END,
           daily_reset_at = CASE WHEN daily_reset_at < ? THEN ? ELSE daily_reset_at END
         WHERE telegram_id = ?`
      )
      .bind(today, today, now, telegramId)
      .run();
  }

  // ── Jobs ───────────────────────────────────────────────────────────────────

  async createJob(params: {
    id: string;
    userId: number;
    url: string;
    prompt: string | null;
    templateId: string | null;
    schemaJson: string | null;
    model: ModelId;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO jobs (id, user_id, url, prompt, template_id, schema_json, model, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
      )
      .bind(
        params.id,
        params.userId,
        params.url,
        params.prompt,
        params.templateId,
        params.schemaJson,
        params.model,
        new Date().toISOString()
      )
      .run();
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    result?: { json?: string; error?: string; durationMs?: number }
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE jobs SET
           status       = ?,
           result_json  = ?,
           error        = ?,
           duration_ms  = ?,
           completed_at = ?
         WHERE id = ?`
      )
      .bind(
        status,
        result?.json ?? null,
        result?.error ?? null,
        result?.durationMs ?? null,
        status === "done" || status === "failed" ? now : null,
        id
      )
      .run();
  }

  async getJob(id: string): Promise<Job | null> {
    return this.db.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<Job>();
  }

  async getUserJobs(telegramId: number, limit = 10, offset = 0): Promise<Job[]> {
    const result = await this.db
      .prepare(
        `SELECT j.* FROM jobs j
         JOIN users u ON u.id = j.user_id
         WHERE u.telegram_id = ?
         ORDER BY j.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(telegramId, limit, offset)
      .all<Job>();
    return result.results;
  }

  async countUserJobs(telegramId: number): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM jobs j
         JOIN users u ON u.id = j.user_id
         WHERE u.telegram_id = ?`
      )
      .bind(telegramId)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }

  // ── Custom Schemas ─────────────────────────────────────────────────────────

  async saveCustomSchema(params: {
    id: string;
    userId: number;
    name: string;
    schemaJson: string;
    prompt: string | null;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO custom_schemas (id, user_id, name, schema_json, prompt, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.id,
        params.userId,
        params.name,
        params.schemaJson,
        params.prompt,
        new Date().toISOString()
      )
      .run();
  }

  async getUserSchemas(userId: number): Promise<CustomSchema[]> {
    const result = await this.db
      .prepare("SELECT * FROM custom_schemas WHERE user_id = ? ORDER BY created_at DESC")
      .bind(userId)
      .all<CustomSchema>();
    return result.results;
  }

  async deleteCustomSchema(id: string, userId: number): Promise<void> {
    await this.db
      .prepare("DELETE FROM custom_schemas WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .run();
  }
}
