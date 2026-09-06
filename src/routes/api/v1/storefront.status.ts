import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { storefrontGetStatus } from "@/lib/server/storefront";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/v1/storefront/status")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        await getSql();
        const result = await storefrontGetStatus(readApiKey(request));
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result);
      },
    },
  },
});
