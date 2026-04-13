-- NexusScraper Bot — D1 Schema
-- Run: wrangler d1 execute nexus-scraper-db --file=schema.sql

-- ── Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id      INTEGER NOT NULL UNIQUE,
  username         TEXT,
  first_name       TEXT    NOT NULL,
  model            TEXT    NOT NULL DEFAULT 'workers_ai',
  anthropic_key    TEXT,
  openai_key       TEXT,
  jobs_today       INTEGER NOT NULL DEFAULT 0,
  daily_reset_at   TEXT    NOT NULL,
  total_jobs       INTEGER NOT NULL DEFAULT 0,
  is_admin         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- ── Jobs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT    PRIMARY KEY,         -- 16-char hex ID
  user_id          INTEGER NOT NULL REFERENCES users(id),
  url              TEXT    NOT NULL,
  prompt           TEXT,
  template_id      TEXT,
  schema_json      TEXT,
  model            TEXT    NOT NULL DEFAULT 'workers_ai',
  status           TEXT    NOT NULL DEFAULT 'queued'
                            CHECK(status IN ('queued','processing','done','failed')),
  result_json      TEXT,
  error            TEXT,
  duration_ms      INTEGER,
  created_at       TEXT    NOT NULL,
  completed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id     ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status      ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at  ON jobs(created_at DESC);

-- ── Custom Schemas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_schemas (
  id               TEXT    PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  name             TEXT    NOT NULL,
  schema_json      TEXT    NOT NULL,
  prompt           TEXT,
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_schemas_user_id ON custom_schemas(user_id);
