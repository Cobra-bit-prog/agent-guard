import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, originFromRequest } from "@/lib/server/http";
import {
  getInvoiceRow,
  invoiceView,
  isHumanUsdcInvoice,
  watchUsdcInvoice,
} from "@/lib/server/billing-core.server";
import { createWatchHandler } from "@/lib/billing/watch";
import { findMatchingUsdcPayment, payoutAddress } from "@/lib/solana-pay.server";

const handleWatch = createWatchHandler({
  json,
  getInvoiceRow,
  isHumanUsdcInvoice,
  watchUsdcInvoice,
  invoiceView,
  origin: originFromRequest,
  findMatchingUsdcPayment,
  payoutAddress,
});

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
