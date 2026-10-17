import { createFileRoute } from "@tanstack/react-router";
import { handleBadgeRequest } from "@/lib/directory/badge-http";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/badge/{$id}.svg")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const sql = await getSql();
          return await handleBadgeRequest(params.id, sql);
        } catch (err) {
          console.error("[badge] lookup failed", err instanceof Error ? err.name : "error");
          return new Response("The list did not load.", {
            status: 503,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }
      },
    },
  },
});
