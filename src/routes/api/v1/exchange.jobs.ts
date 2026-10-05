import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import {
  ListingError,
  clientIp,
  createListing,
  hashPosterIp,
  isUndefinedTable,
  listOpenJobs,
} from "@/lib/exchange/listings";
import { CORS, json } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/exchange/jobs")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const sql = await getSql();
          const jobs = await listOpenJobs(sql);
          return json({ jobs });
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json({ error: "Job board is not on this database yet." }, 503);
          }
          console.error("[exchange] list failed", err instanceof Error ? err.name : "error");
          return json({ error: "Could not load jobs" }, 500);
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
          const job = await createListing(
            sql,
            body,
            new Date(),
            hashPosterIp(clientIp(request.headers)),
          );
          return json({ job }, 201);
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json({ error: "Job board is not on this database yet." }, 503);
          }
          if (err instanceof ListingError) return json({ error: err.message }, err.status);
          console.error("[exchange] create failed", err instanceof Error ? err.name : "error");
          return json({ error: "Could not post this job." }, 500);
        }
      },
    },
  },
});
