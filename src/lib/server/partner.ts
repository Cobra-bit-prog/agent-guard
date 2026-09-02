import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { PARTNER_COOKIE, parsePartnerSlug } from "../partner";

export const persistPartnerSource = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ partner: z.optional(z.string().max(64)) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const fromBody = parsePartnerSlug(data.partner);
    let fromCookie: string | null = null;
    try {
      const { getCookie } = await import("@tanstack/react-start/server");
      fromCookie = parsePartnerSlug(getCookie(PARTNER_COOKIE));
    } catch {
      fromCookie = null;
    }
    const slug = fromBody ?? fromCookie;
    if (!slug) return { ok: true as const, stored: false as const };
    const { rememberPartnerSource } = await import("../partner-persist.server");
    await rememberPartnerSource(context.userId, slug);
    return { ok: true as const, stored: true as const };
  });
