import { createFileRoute } from "@tanstack/react-router";
import { CHECKOUT_USAGE } from "@/lib/agent-checkout";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { startAgentCheckout } from "@/lib/server/agent-checkout";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/v1/billing/checkout")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => json(CHECKOUT_USAGE),
      POST: async ({ request }) => {
        await getSql();
        const apiKey = readApiKey(request);
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON body required." }, 400);
        }
        const result = await startAgentCheckout({ apiKey, body });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result);
      },
    },
  },
});
