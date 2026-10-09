import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { handleListingsPost } from "@/lib/directory/listings-http";
import { isUndefinedTable, listVisibleListings } from "@/lib/directory/listings";
import { listingsPayload } from "@/lib/directory/self-list";
import { CORS, json } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/agents/listings")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const sql = await getSql();
          const listings = await listVisibleListings(sql);
          return json(listingsPayload({ listings }));
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json(listingsPayload({ error: "Agent directory is not on this database yet." }), 503);
          }
          console.error("[directory] list failed", err instanceof Error ? err.name : "error");
          return json(listingsPayload({ error: "Could not load agents" }), 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const sql = await getSql();
          return await handleListingsPost(request, sql);
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json(listingsPayload({ error: "Agent directory is not on this database yet." }), 503);
          }
          console.error("[directory] create failed", err instanceof Error ? err.name : "error");
          return json(listingsPayload({ error: "Could not list this agent." }), 500);
        }
      },
    },
  },
});
