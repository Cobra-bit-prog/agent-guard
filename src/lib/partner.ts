/** First-touch partner attribution from `?partner=` (marketing only). */

export const PARTNER_COOKIE = "ac_partner";
export const PARTNER_STORAGE_KEY = "ac_partner";
export const PARTNER_MAX_AGE_SEC = 60 * 60 * 24 * 180;

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Lowercase alphanumeric + hyphen, 1–32 chars. Invalid values are ignored. */
export function parsePartnerSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  if (!SLUG.test(slug)) return null;
  return slug;
}

export function partnerSlugFromSearchParams(
  search: string | URLSearchParams | Record<string, unknown> | undefined | null,
): string | null {
  if (!search) return null;
  if (typeof search === "string") {
    const qs = search.startsWith("?") ? search.slice(1) : search;
    return parsePartnerSlug(new URLSearchParams(qs).get("partner"));
  }
  if (typeof URLSearchParams !== "undefined" && search instanceof URLSearchParams) {
    return parsePartnerSlug(search.get("partner"));
  }
  if (typeof search === "object" && search !== null && "partner" in search) {
    return parsePartnerSlug((search as { partner?: unknown }).partner);
  }
  return null;
}

export function partnerSlugFromCookieHeader(header: string | undefined | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== PARTNER_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return parsePartnerSlug(decodeURIComponent(raw));
    } catch {
      return parsePartnerSlug(raw);
    }
  }
  return null;
}

export function partnerCookieWrite(slug: string): string {
  const valid = parsePartnerSlug(slug);
  if (!valid) return "";
  return `${PARTNER_COOKIE}=${encodeURIComponent(valid)}; Path=/; Max-Age=${PARTNER_MAX_AGE_SEC}; SameSite=Lax`;
}

/** Incoming slug wins only when nothing is stored on the principal yet. */
export function firstTouchPartnerSlug(
  existing: string | null | undefined,
  incoming: unknown,
): string | null {
  if (parsePartnerSlug(existing)) return null;
  return parsePartnerSlug(incoming);
}

export function readStoredPartnerSlug(): string | null {
  if (typeof window === "undefined") return null;
  const fromCookie = partnerSlugFromCookieHeader(document.cookie);
  if (fromCookie) return fromCookie;
  try {
    return parsePartnerSlug(window.localStorage.getItem(PARTNER_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storePartnerSlug(slug: string): void {
  if (typeof window === "undefined") return;
  const valid = parsePartnerSlug(slug);
  if (!valid) return;
  document.cookie = partnerCookieWrite(valid);
  try {
    window.localStorage.setItem(PARTNER_STORAGE_KEY, valid);
  } catch {
    /* storage unavailable — cookie still set */
  }
}
