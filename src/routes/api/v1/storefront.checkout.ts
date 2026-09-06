import { createFileRoute } from "@tanstack/react-router";
import { CHECKOUT_USAGE } from "@/lib/storefront";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { storefrontCreateCheckout } from "@/lib/server/storefront";
import { getSql } from "@/lib/db";

/** Same contract as POST /api/v1/billing/checkout (Layer2 shape). */
export const Route = createFileRoute("/api/v1/storefront/checkout")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => json({ ...CHECKOUT_USAGE, alias_of: "POST /api/v1/billing/checkout" }),
      POST: async ({ request }) => {
        await getSql();
        const apiKey = readApiKey(request);
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON body required." }, 400);
        }
        const result = await storefrontCreateCheckout({ apiKey, body });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result);
      },
    },
  },
});
