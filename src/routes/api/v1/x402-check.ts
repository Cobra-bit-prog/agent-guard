import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { CORS } from "@/lib/server/http";
import { handleX402CheckRequest } from "@/lib/x402-check/http";

async function sqlOrNull() {
  try {
    return await getSql();
  } catch (err) {
    console.error("[x402-check] database unavailable", err instanceof Error ? err.name : "error");
    return null;
  }
}

export const Route = createFileRoute("/api/v1/x402-check")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handleX402CheckRequest(request, await sqlOrNull()),
      POST: async ({ request }) => handleX402CheckRequest(request, await sqlOrNull()),
    },
  },
});
