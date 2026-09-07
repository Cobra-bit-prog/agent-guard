import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { applyHeliusPayload } from "@/lib/server/billing-core.server";

function webhookAuthorized(request: Request): boolean {
  const secret = process.env.HELIUS_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const got =
    request.headers.get("authorization") ||
    request.headers.get("x-helius-secret") ||
    "";
  return got.includes(secret);
}

export const Route = createFileRoute("/api/v1/billing/helius")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        if (!webhookAuthorized(request)) {
          return json({ error: "Unauthorized webhook." }, 401);
        }
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        try {
          const paid = await applyHeliusPayload(body);
          return json({ ok: true, matched: paid.length, paid });
        } catch (err) {
          console.error("[billing] helius webhook failed", err);
          return json({ ok: false, matched: 0, paid: [] }, 200);
        }
      },
    },
  },
});
