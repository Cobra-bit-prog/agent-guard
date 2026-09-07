/**
 * Helius env helpers (lab api/v1/billing/helius.js + config.js).
 * Missing HELIUS_API_KEY means helius:false — pay UI still polls /watch.
 */

/** Lab `config.helius = Boolean(HELIUS_API_KEY)`. Blank/whitespace is false. */
export function heliusConfigured(): boolean {
  return Boolean(process.env.HELIUS_API_KEY?.trim());
}

export function heliusWebhookAuthorized(request: Request): boolean {
  const secret = process.env.HELIUS_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const got =
    request.headers.get("authorization") ||
    request.headers.get("x-helius-secret") ||
    "";
  return got.includes(secret);
}

export function heliusWebhookUrl(origin: string): string {
  const override = process.env.HELIUS_WEBHOOK_URL?.trim();
  if (override) return override;
  return `${origin.replace(/\/$/, "")}/api/v1/billing/helius`;
}
