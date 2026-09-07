import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, originFromRequest } from "@/lib/server/http";
import {
  getInvoiceRow,
  invoiceView,
  isHumanUsdcInvoice,
  watchUsdcInvoice,
} from "@/lib/server/billing-core.server";
import { parsePaidPlan } from "@/lib/pay-invoice";
import { findMatchingUsdcPayment, payoutAddress } from "@/lib/solana-pay.server";
import { PLANS } from "@/lib/plans";

/** Public status poll. Pay UI works without Helius. */
export const Route = createFileRoute("/api/v1/billing/watch")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: handleWatch,
      POST: handleWatch,
    },
  },
});

async function handleWatch({ request }: { request: Request }) {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }
  }
  const id = String(url.searchParams.get("id") || body.id || "").trim();
  const reference = String(url.searchParams.get("reference") || body.reference || "").trim();
  const key = id || reference;
  if (!key) return json({ error: "Provide id or reference." }, 400);

  let row = await getInvoiceRow(key);
  if (row && !isHumanUsdcInvoice(row)) {
    return json({ error: "Invoice is not Solana USDC.", asset: row.asset, chain: row.chain }, 409);
  }
  if (!row) {
    const plan = parsePaidPlan(url.searchParams.get("plan") || body.plan);
    if (!reference) return json({ error: "Invoice not found." }, 404);
    try {
      const match = await findMatchingUsdcPayment({
        reference,
        recipient: payoutAddress(),
        amountUsdc: PLANS[plan].price,
      });
      return json({
        status: match.kind === "paid" ? "paid" : "pending",
        signature: match.kind === "paid" || match.kind === "underpaid" ? match.signature : null,
        recipient: payoutAddress(),
      });
    } catch (err) {
      console.error("[billing] watch rpc failed", err);
      return json({ status: "pending", signature: null, recipient: payoutAddress() });
    }
  }
  try {
    row = await watchUsdcInvoice(row);
  } catch (err) {
    console.error("[billing] watch failed", err);
  }
  return json(invoiceView(row, originFromRequest(request)));
}
