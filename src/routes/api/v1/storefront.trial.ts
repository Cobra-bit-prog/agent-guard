import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { storefrontStartTrial } from "@/lib/server/storefront";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/v1/storefront/trial")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () =>
        json({
          usage: "POST /api/v1/storefront/trial",
          body: { human_email: "ops@example.com" },
          note: "A human principal must sign up. Agents cannot open a root account. Trial starts when the human creates the account.",
        }),
      POST: async ({ request }) => {
        await getSql();
        const apiKey = readApiKey(request);
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON body required." }, 400);
        }
        const result = await storefrontStartTrial({ apiKey, body });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result);
      },
    },
  },
});
