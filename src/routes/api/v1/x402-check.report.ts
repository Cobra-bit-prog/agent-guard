import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { CORS } from "@/lib/server/http";
import { handleX402ReportRequest } from "@/lib/x402-check/http";

export const Route = createFileRoute("/api/v1/x402-check/report")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handleX402ReportRequest(request, await getSql()),
      POST: async ({ request }) => handleX402ReportRequest(request, await getSql()),
    },
  },
});
