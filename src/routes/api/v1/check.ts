import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { checkTransferIntent } from "@/lib/server/intent";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/v1/check")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () =>
        json({
          usage: "POST /api/v1/check with Authorization: Bearer <agent api key>",
          body: { to: "destination address", value_usd: 250 },
          note: "Call this before signing. If must_abort is true, do not send.",
        }),
      POST: async ({ request }) => {
        await getSql();
        const apiKey = readApiKey(request);
        let body: { to?: string; value_usd?: number; valueUsd?: number; native?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "JSON body required." }, 400);
        }
        const to = String(body.to ?? "").trim();
        const valueUsd = Number(body.value_usd ?? body.valueUsd ?? 0);
        if (!to || !Number.isFinite(valueUsd) || valueUsd <= 0) {
          return json({ error: "Provide to and value_usd." }, 400);
        }
        const result = await checkTransferIntent({
          apiKey,
          to,
          valueUsd,
          native: body.native,
        });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result);
      },
    },
  },
});
