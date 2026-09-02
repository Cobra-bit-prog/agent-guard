import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { pollApprovalIntent } from "@/lib/server/intent";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/v1/approvals/$id")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        await getSql();
        const apiKey = readApiKey(request);
        const result = await pollApprovalIntent({
          apiKey,
          approvalId: params.id,
        });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result);
      },
    },
  },
});
