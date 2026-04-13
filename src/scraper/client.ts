import type { SchemaTemplate } from "./templates";

export interface ScrapeRequest {
  url: string;
  prompt?: string;
  schema?: Record<string, unknown>;
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  userAgent?: string;
  custom_ai?: Array<{ model: string; authorization: string }>;
}

export interface ScrapeResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export class BrowserRenderingClient {
  private readonly baseUrl: string;

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string
  ) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering`;
  }

  async scrapeJSON(req: ScrapeRequest): Promise<ScrapeResult> {
    const start = Date.now();

    const body: Record<string, unknown> = {
      url: req.url,
    };

    if (req.prompt) body.prompt = req.prompt;

    if (req.schema) {
      body.response_format = {
        type: "json_schema",
        schema: req.schema,
      };
    }

    if (req.waitUntil) {
      body.gotoOptions = { waitUntil: req.waitUntil };
    }

    if (req.userAgent) {
      body.userAgent = req.userAgent;
    }

    if (req.custom_ai && req.custom_ai.length > 0) {
      body.custom_ai = req.custom_ai;
    }

    try {
      const res = await fetch(`${this.baseUrl}/json`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const durationMs = Date.now() - start;

      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `HTTP ${res.status}: ${text}`, durationMs };
      }

      const json = (await res.json()) as { success: boolean; result?: unknown; errors?: unknown[] };

      if (!json.success) {
        return {
          success: false,
          error: JSON.stringify(json.errors ?? "Unknown error"),
          durationMs,
        };
      }

      return {
        success: true,
        data: json.result as Record<string, unknown>,
        durationMs,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown fetch error",
        durationMs: Date.now() - start,
      };
    }
  }

  async scrapeWithTemplate(
    url: string,
    template: SchemaTemplate,
    customAi?: Array<{ model: string; authorization: string }>
  ): Promise<ScrapeResult> {
    return this.scrapeJSON({
      url,
      prompt: template.prompt,
      schema: template.schema,
      waitUntil: template.waitUntil,
      custom_ai: customAi,
    });
  }

  async scrapeWithPrompt(
    url: string,
    prompt: string,
    customAi?: Array<{ model: string; authorization: string }>
  ): Promise<ScrapeResult> {
    return this.scrapeJSON({ url, prompt, custom_ai: customAi });
  }

  async crawlPage(url: string): Promise<{ content: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/crawl`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url, returnOnlyVisible: true }),
      });

      if (!res.ok) {
        return { content: "", error: `HTTP ${res.status}` };
      }

      const json = (await res.json()) as { result?: { markdown?: string } };
      return { content: json.result?.markdown ?? "" };
    } catch (err) {
      return { content: "", error: err instanceof Error ? err.message : "Error" };
    }
  }
}
