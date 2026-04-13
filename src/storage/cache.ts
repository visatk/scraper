import type { KVNamespace } from "@cloudflare/workers-types";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_PER_WINDOW = 5;
const DAILY_LIMIT = 50;

export class Cache {
  constructor(private readonly kv: KVNamespace) {}

  // ── Rate Limiting ──────────────────────────────────────────────────────────

  async checkRateLimit(userId: number): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const key = `rl:${userId}:${Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS)}`;
    const current = parseInt((await this.kv.get(key)) ?? "0", 10);

    if (current >= RATE_LIMIT_MAX_PER_WINDOW) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: RATE_LIMIT_WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % RATE_LIMIT_WINDOW_SECONDS),
      };
    }

    await this.kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS * 2 });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_PER_WINDOW - current - 1,
      resetIn: RATE_LIMIT_WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % RATE_LIMIT_WINDOW_SECONDS),
    };
  }

  // ── Session / Conversation State ───────────────────────────────────────────

  async setSessionState(userId: number, state: Record<string, unknown>): Promise<void> {
    await this.kv.put(`session:${userId}`, JSON.stringify(state), { expirationTtl: 600 });
  }

  async getSessionState(userId: number): Promise<Record<string, unknown> | null> {
    const raw = await this.kv.get(`session:${userId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async clearSessionState(userId: number): Promise<void> {
    await this.kv.delete(`session:${userId}`);
  }

  // ── Job Processing Lock ────────────────────────────────────────────────────

  async acquireJobLock(jobId: string): Promise<boolean> {
    const key = `lock:job:${jobId}`;
    const existing = await this.kv.get(key);
    if (existing) return false;
    await this.kv.put(key, "1", { expirationTtl: 120 });
    return true;
  }

  async releaseJobLock(jobId: string): Promise<void> {
    await this.kv.delete(`lock:job:${jobId}`);
  }

  // ── Result Cache (avoid re-scraping same URL within TTL) ──────────────────

  async cacheResult(url: string, templateId: string, result: unknown, ttlSeconds = 300): Promise<void> {
    const key = `cache:${templateId}:${btoa(url).slice(0, 64)}`;
    await this.kv.put(key, JSON.stringify(result), { expirationTtl: ttlSeconds });
  }

  async getCachedResult(url: string, templateId: string): Promise<unknown | null> {
    const key = `cache:${templateId}:${btoa(url).slice(0, 64)}`;
    const raw = await this.kv.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ── Pending Message Tracking ───────────────────────────────────────────────

  async setPendingMessage(jobId: string, chatId: number, messageId: number): Promise<void> {
    await this.kv.put(
      `pending:${jobId}`,
      JSON.stringify({ chatId, messageId }),
      { expirationTtl: 300 }
    );
  }

  async getPendingMessage(jobId: string): Promise<{ chatId: number; messageId: number } | null> {
    const raw = await this.kv.get(`pending:${jobId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { chatId: number; messageId: number };
    } catch {
      return null;
    }
  }

  async clearPendingMessage(jobId: string): Promise<void> {
    await this.kv.delete(`pending:${jobId}`);
  }
}
