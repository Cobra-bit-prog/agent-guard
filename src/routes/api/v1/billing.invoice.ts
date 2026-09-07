import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, originFromRequest } from "@/lib/server/http";
import {
  createUsdcInvoice,
  getInvoiceRow,
  invoiceView,
  isHumanUsdcInvoice,
  setInvoiceEmail,
  watchUsdcInvoice,
} from "@/lib/server/billing-core.server";
import { parseEmail, parsePaidPlan } from "@/lib/pay-invoice";

export const Route = createFileRoute("/api/v1/billing/invoice")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON body required." }, 400);
        }
        const rec = body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {};
        try {
          const existingId = typeof rec.id === "string" ? rec.id.trim() : "";
          if (existingId) {
            const email = parseEmail(rec.email ?? rec.human_email);
            if (!email) return json({ error: "Enter a valid email." }, 400);
            const row = await setInvoiceEmail(existingId, email);
            if (!row) return json({ error: "Invoice not found." }, 404);
            if (!isHumanUsdcInvoice(row)) {
              return json({ error: "Invoice is not Solana USDC." }, 409);
            }
            return json(invoiceView(row, originFromRequest(request)));
          }
          const row = await createUsdcInvoice({
            plan: parsePaidPlan(rec.plan),
            email: parseEmail(rec.email ?? rec.human_email),
            source: "human",
          });
          return json(invoiceView(row, originFromRequest(request)));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not create invoice.";
          return json({ error: message }, 500);
        }
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = (url.searchParams.get("id") || url.searchParams.get("reference") || "").trim();
        if (!id) return json({ error: "Provide id." }, 400);
        let row = await getInvoiceRow(id);
        if (!row) return json({ error: "Invoice not found." }, 404);
        if (!isHumanUsdcInvoice(row)) {
          return json({ error: "Invoice is not Solana USDC.", asset: row.asset, chain: row.chain }, 409);
        }
        if (row.status !== "paid") {
          try {
            row = await watchUsdcInvoice(row);
          } catch (err) {
            console.error("[billing] invoice poll failed", err);
          }
        }
        return json(invoiceView(row, originFromRequest(request)));
      },
    },
  },
});
