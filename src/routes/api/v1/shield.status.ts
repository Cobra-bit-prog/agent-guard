import { createFileRoute } from "@tanstack/react-router";
import allowlist from "@/data/shop-shield.json";
import { shieldStatusFromSearch, type ShieldCustomer } from "@/lib/shop-shield";
import { CORS, json } from "@/lib/server/http";

/**
 * Shop Shield status for a seller slug or host.
 * Does not gate stamp verify or the gate demo. Empty allowlist means nobody is on.
 */
export const Route = createFileRoute("/api/v1/shield/status")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: ({ request }) => {
        const url = new URL(request.url);
        const customers = Array.isArray(allowlist.customers)
          ? (allowlist.customers as ShieldCustomer[])
          : [];
        const result = shieldStatusFromSearch(
          {
            seller: url.searchParams.get("seller"),
            host: url.searchParams.get("host"),
          },
          customers,
        );
        if ("error" in result) return json({ error: result.error }, 400);
        return json(result);
      },
    },
  },
});
