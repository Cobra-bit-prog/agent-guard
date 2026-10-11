import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { CORS } from "@/lib/server/http";
import { handleAgentReportRequest } from "@/lib/agent-check/http";

async function sqlOrNull() {
  try {
    return await getSql();
  } catch (err) {
    console.error("[agent-check] database unavailable", err instanceof Error ? err.name : "error");
    return null;
  }
}

export const Route = createFileRoute("/api/v1/agent-check/report")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handleAgentReportRequest(request, await sqlOrNull()),
      POST: async ({ request }) => handleAgentReportRequest(request, await sqlOrNull()),
    },
  },
});
