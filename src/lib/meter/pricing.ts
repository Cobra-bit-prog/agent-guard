export const METER_PASS_SKU = "pass_1h" as const;

export const METER_PASS_1H = {
  id: METER_PASS_SKU,
  price_usd: 0.25,
  duration_sec: 3600,
  included_calls: 200,
  covers: ["scan", "preflight"] as const,
  asset: "usdc" as const,
  chain: "solana" as const,
  amount_base_units: "250000",
};

export function meterPricing() {
  return {
    product: "Agent Meter",
    note: "No email. No API key. Pay a pass, then call scan and preflight. Human App ($29 Inbox) is separate.",
    pass: METER_PASS_1H,
    endpoints: {
      pricing: "GET /api/v1/meter/pricing",
      pass: "POST /api/v1/meter/pass",
      scan: "POST /api/v1/meter/scan",
      preflight: "POST /api/v1/meter/preflight",
    },
    header: "X-Agent-Pass",
  };
}

export function meter402Body(invoice: {
  invoice_id: string;
  pay_to: string;
  reference: string;
  amount_usd: number;
  amount_base_units: string;
  chain: string;
  asset: string;
}) {
  return {
    error: "payment_required",
    http: 402,
    sku: METER_PASS_SKU,
    price_usd: METER_PASS_1H.price_usd,
    asset: invoice.asset,
    chain: invoice.chain,
    pay_to: invoice.pay_to,
    amount_usd: invoice.amount_usd,
    amount_base_units: invoice.amount_base_units,
    invoice_id: invoice.invoice_id,
    reference: invoice.reference,
    next: "POST /api/v1/meter/pass with proof after paying, or retry with X-Agent-Pass",
  };
}
