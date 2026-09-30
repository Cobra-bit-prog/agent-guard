import { createFileRoute } from "@tanstack/react-router";
import { createCardSession, humanPayOptions } from "@/lib/easy-pay";
import { CORS, json } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/billing/card")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => json(humanPayOptions("starter")),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { plan?: string };
        const session = await createCardSession(body.plan);
        if (!session.ok) return json(session, session.http);
        return json(session);
      },
    },
  },
});
