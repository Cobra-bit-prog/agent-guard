import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import {
  ListingError,
  clientIp,
  createListing,
  hashClientIp,
  isUndefinedTable,
  listVisibleListings,
} from "@/lib/directory/listings";
import { CORS, json } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/agents/listings")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const sql = await getSql();
          const listings = await listVisibleListings(sql);
          return json({ listings });
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json({ error: "Agent directory is not on this database yet." }, 503);
          }
          console.error("[directory] list failed", err instanceof Error ? err.name : "error");
          return json({ error: "Could not load agents" }, 500);
        }
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        try {
          const sql = await getSql();
          const listing = await createListing(
            sql,
            body,
            new Date(),
            hashClientIp(clientIp(request.headers)),
          );
          return json({ listing }, 201);
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json({ error: "Agent directory is not on this database yet." }, 503);
          }
          if (err instanceof ListingError) return json({ error: err.message }, err.status);
          console.error("[directory] create failed", err instanceof Error ? err.name : "error");
          return json({ error: "Could not list this agent." }, 500);
        }
      },
    },
  },
});
