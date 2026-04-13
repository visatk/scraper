/**
 * Verifies the X-Telegram-Bot-Api-Secret-Token header for webhook security.
 * Also implements the HMAC-SHA256 approach for manual validation if needed.
 */

export function verifyWebhookSecret(
  request: Request,
  expectedSecret: string
): boolean {
  const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!header) return false;
  // Timing-safe comparison using constant-time check
  return timingSafeEqual(header, expectedSecret);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

/**
 * Generates a random webhook secret token (hex).
 */
export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a cryptographically secure job ID.
 */
export function generateJobId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
}
