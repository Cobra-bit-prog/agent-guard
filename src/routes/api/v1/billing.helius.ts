import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { applyHeliusPayload } from "@/lib/server/billing-core.server";
import { heliusWebhookAuthorized } from "@/lib/server/helius.server";

/** Port of lab `api/v1/billing/helius.js` — POST webhook. Pay UI does not need this key. */
export const Route = createFileRoute("/api/v1/billing/helius")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => json({ error: "Helius webhook is POST only." }, 405),
      POST: async ({ request }) => {
        if (!heliusWebhookAuthorized(request)) {
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
