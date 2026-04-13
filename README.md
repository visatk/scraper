# 🕷️ NexusScraper Bot

> Enterprise-grade AI Web Extraction Telegram Bot on Cloudflare Workers

NexusScraper uses Cloudflare's [Browser Rendering `/json` endpoint](https://developers.cloudflare.com/browser-rendering/quick-actions/json-endpoint/) to extract structured data from any webpage using AI — delivered right inside Telegram with a polished bot interface.

---

## ✨ Features

| Feature | Details |
|---|---|
| **8 Schema Templates** | E-Commerce, Articles, Jobs, Real Estate, Profiles, Contacts, Reviews, Page Structure |
| **3 AI Models** | Workers AI (Llama 3.3 70B), Claude Sonnet 4, GPT-4o |
| **Model Fallbacks** | Automatic failover chain if primary model fails |
| **Custom Prompts** | Free-form extraction with natural language |
| **JSON Export** | Download results as `.json` files directly in Telegram |
| **Job History** | Paginated history with full job details |
| **Rate Limiting** | 5 req/min + 50 jobs/day per user, KV-backed |
| **Session State** | Multi-step flows (template picker, key setup) |
| **Webhook Security** | HMAC-SHA256 secret token verification |
| **Source Maps** | Uploaded for production-grade error traces |
| **Observability** | Structured logging via Cloudflare Workers Observability |

---

## 🏗️ Architecture

```
Telegram
  │
  ▼ HTTPS POST /webhook (secret-verified)
┌─────────────────────────────────┐
│   Cloudflare Worker             │
│   src/index.ts → router         │
│                                 │
│  ┌──────────────────────────┐   │
│  │  CommandHandlers         │   │
│  │  CallbackHandlers        │   │
│  └─────────┬────────────────┘   │
│            │                    │
│   ┌────────▼──────────────┐     │
│   │ BrowserRenderingClient│     │
│   │  POST /json (AI)      │     │
│   └───────────────────────┘     │
│                                 │
│  Bindings:                      │
│  ├── D1   (jobs/users/schemas)  │
│  └── KV   (rate limit/session)  │
└─────────────────────────────────┘
```

---

## 🚀 Setup

### 1. Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### 2. Create Cloudflare Resources

```bash
# Create KV namespace
wrangler kv namespace create KV
# → Copy the ID into wrangler.jsonc

# Create D1 database
wrangler d1 create nexus-scraper-db
# → Copy the ID into wrangler.jsonc

# Initialize D1 schema (local dev)
npm run db:init

# Initialize D1 schema (production)
npm run db:init:remote
```

### 3. Set Secrets

```bash
# Telegram bot token from @BotFather
wrangler secret put TELEGRAM_BOT_TOKEN

# Random 32-byte hex — generate with: openssl rand -hex 32
wrangler secret put WEBHOOK_SECRET

# Your Cloudflare account ID (from dash.cloudflare.com)
wrangler secret put CF_ACCOUNT_ID

# API token with "Browser Rendering - Edit" permission
# Create at: https://dash.cloudflare.com/profile/api-tokens
wrangler secret put CF_API_TOKEN
```

### 4. Deploy

```bash
# Install dependencies
npm install

# Generate types
npm run types

# Deploy to production
npm run deploy
```

### 5. Register Webhook

After deploying, register your webhook with Telegram:

```bash
curl -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  https://nexus-scraper-bot.YOUR_SUBDOMAIN.workers.dev/setup
```

This registers the webhook URL and sets all bot commands automatically.

---

## 🤖 Bot Commands

| Command | Description |
|---|---|
| `/start` | Onboarding & welcome |
| `/scrape <url> [prompt]` | AI-scrape with optional custom prompt |
| `/extract <url>` | Pick a smart schema template |
| `/history` | Paginated job history |
| `/job <id>` | View job details & result |
| `/export <id>` | Download result as JSON |
| `/model` | Switch AI model |
| `/keys` | Manage API keys (Claude/GPT-4o) |
| `/quota` | Usage stats & daily limits |
| `/help` | Full command reference |

---

## 📋 Schema Templates

| Template | Use Case |
|---|---|
| 🛒 E-Commerce Product | Name, price, availability, specs, reviews |
| 📰 News / Article | Title, author, date, tags, key points |
| 💼 Job Listing | Role, salary, skills, requirements |
| 🏠 Real Estate | Price, beds, baths, area, agent |
| 👤 Social Profile | Handle, followers, bio, links |
| 📇 Contact Information | Emails, phones, address, social media |
| ⭐ Reviews & Ratings | Overall rating, breakdown, individual reviews |
| 📑 Page Structure | Headings, links, word count |

---

## 🔧 Custom AI Models

Users can supply their own API keys to use premium models:

```
/keys → Set Anthropic Key → [paste sk-ant-...] → ✅
/model → Claude Sonnet 4 ✓
```

Model fallback chain (configured automatically):
1. **Claude Sonnet 4** (anthropic/claude-sonnet-4-20250514)
2. **Workers AI** (fallback — no extra cost)

---

## 📁 Project Structure

```
nexus-scraper-bot/
├── src/
│   ├── index.ts                  # Worker entry, router, webhook setup
│   ├── telegram/
│   │   ├── bot.ts                # TelegramBot API client
│   │   ├── types.ts              # Telegram type definitions
│   │   └── webhook.ts            # Signature verification, ID generation
│   ├── handlers/
│   │   └── commands.ts           # All command + callback handlers
│   ├── scraper/
│   │   ├── client.ts             # Browser Rendering API client
│   │   └── templates.ts          # 8 pre-built schema templates
│   ├── storage/
│   │   ├── db.ts                 # D1 operations
│   │   └── cache.ts              # KV operations
│   └── utils/
│       ├── format.ts             # HTML message formatters
│       └── keyboards.ts          # Inline keyboard builders
├── schema.sql                    # D1 database schema
├── wrangler.jsonc                # Wrangler configuration
├── tsconfig.json
└── package.json
```

---

## 🔒 Security

- Webhook requests verified with `X-Telegram-Bot-Api-Secret-Token` header
- Timing-safe string comparison (no timing side-channels)
- API keys stored in D1, never logged
- User's API key messages auto-deleted after capture
- Rate limiting: 5/min + 50/day enforced via KV atomic counters
- No `passThroughOnException` — explicit error handling throughout
- All secrets via `wrangler secret put` — never in source

---

## 📊 Limits & Quotas

| Limit | Value |
|---|---|
| Rate limit | 5 jobs / 60 seconds per user |
| Daily limit | 50 jobs / day per user |
| Telegram message max | 4096 chars (auto-chunked) |
| Result preview | 2000 chars (full result downloadable) |
| Session TTL | 10 minutes |
| Result cache TTL | 5 minutes |

---

## 🛠️ Local Development

```bash
# Start local dev with hot reload
npm run dev

# Point ngrok (or similar) to localhost:8787
# Update webhook to your ngrok URL for testing
```

---

## 📝 License

MIT
