import { METER_PASS_1H } from "./pricing.ts";
import type { MeterPaymentRow, MeterReport } from "./store.ts";

function shortRef(value: string | null, chars = 4) {
  if (!value) return null;
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}

export type PublicMeterPayment = {
  amount_usd: number;
  paid_at: string;
  signature: string;
  signature_short: string;
  payer: string | null;
};

export type PublicMeterLive = {
  product: "Agent Meter";
  page: "/meter";
  pass: {
    price_usd: number;
    duration_sec: number;
    included_calls: number;
    covers: readonly string[];
  };
  funds: MeterReport["funds"];
  usdc_received: number;
  usdc_pending: number;
  invoices_created: number;
  invoices_paid: number;
  invoices_pending: number;
  passes_issued: number;
  agents_paid: number;
  calls: number;
  recent_payments: PublicMeterPayment[];
  generated_at: string;
};

export function publicMeterPayment(row: MeterPaymentRow): PublicMeterPayment {
  return {
    amount_usd: row.amount_usd,
    paid_at: row.paid_at,
    signature: row.signature,
    signature_short: shortRef(row.signature, 6) ?? row.signature,
    payer: shortRef(row.payer_address),
  };
}

export function publicMeterLive(report: MeterReport): PublicMeterLive {
  return {
    product: "Agent Meter",
    page: "/meter",
    pass: {
      price_usd: METER_PASS_1H.price_usd,
      duration_sec: METER_PASS_1H.duration_sec,
      included_calls: METER_PASS_1H.included_calls,
      covers: METER_PASS_1H.covers,
    },
    funds: report.funds,
    usdc_received: report.usdc_received,
    usdc_pending: report.usdc_pending,
    invoices_created: report.invoices_created,
    invoices_paid: report.invoices_paid,
    invoices_pending: report.invoices_pending,
    passes_issued: report.passes_issued,
    agents_paid: report.agents_paid,
    calls: report.calls,
    recent_payments: report.recent_payments.slice(0, 20).map(publicMeterPayment),
    generated_at: report.generated_at,
  };
}
