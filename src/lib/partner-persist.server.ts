import { getCookie } from "@tanstack/react-start/server";
import { getSql } from "./db";
import { PARTNER_COOKIE, parsePartnerSlug } from "./partner";

/**
 * Persist a partner slug on the principal only when none is stored yet.
 * Safe to call from signup hooks and authenticated pages. Never throws to
 * callers — attribution must not break auth or the console.
 */
export async function rememberPartnerSource(
  userId: string,
  incoming: unknown,
): Promise<string | null> {
  const slug = parsePartnerSlug(incoming);
  if (!slug || !userId) return null;
  try {
    const sql = await getSql();
    await sql.query(
      `insert into user_partner_source (user_id, partner_source)
       values ($1, $2)
       on conflict (user_id) do nothing`,
      [userId, slug],
    );
    return slug;
  } catch {
    console.error("[partner] first-touch persist failed");
    return null;
  }
}

export async function rememberPartnerSourceFromCookie(userId: string): Promise<string | null> {
  let cookie: string | undefined;
  try {
    cookie = getCookie(PARTNER_COOKIE);
  } catch {
    cookie = undefined;
  }
  return rememberPartnerSource(userId, cookie ?? null);
}
