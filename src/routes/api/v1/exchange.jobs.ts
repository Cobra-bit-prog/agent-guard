import { createFileRoute } from "@tanstack/react-router";
import { ExchangeBooksError, createOpenJob, isUndefinedTable, listFundedBoard } from "@/lib/exchange/books";
import { getSql } from "@/lib/db";
import { CORS, json } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/exchange/jobs")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const emptyStats = { locked_usdc: 0, released_count: 0, kept_usdc: "0" };
        try {
          const sql = await getSql();
          const board = await listFundedBoard(sql);
          return json({ jobs: board.jobs, stats: board.stats, books: "ready" });
        } catch (err) {
          if (isUndefinedTable(err)) return json({ jobs: [], stats: emptyStats, books: "missing" });
          console.error("[exchange] list failed", err instanceof Error ? err.name : "error");
          return json({ error: "Could not read funded jobs" }, 500);
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
          const job = await createOpenJob(sql, body, new Date());
          return json({ job }, 201);
        } catch (err) {
          if (isUndefinedTable(err)) {
            return json(
              { error: "Exchange books are not on this database. Test copy only." },
              503,
            );
          }
          if (err instanceof ExchangeBooksError) return json({ error: err.message }, 400);
          console.error("[exchange] create failed", err instanceof Error ? err.name : "error");
          return json({ error: "Could not list the job" }, 500);
        }
      },
    },
  },
});
