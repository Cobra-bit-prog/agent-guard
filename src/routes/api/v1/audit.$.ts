import { createFileRoute } from "@tanstack/react-router";
import { CORS } from "@/lib/server/http";
import { handleSpendAuditRequest } from "@/lib/spend-audit-http";

export const Route = createFileRoute("/api/v1/audit/$")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: ({ request }) => handleSpendAuditRequest(request, new URL(request.url).pathname),
      POST: ({ request }) => handleSpendAuditRequest(request, new URL(request.url).pathname),
    },
  },
});
