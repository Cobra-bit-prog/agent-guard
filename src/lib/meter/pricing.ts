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
    funds: {
      pay_to: "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR",
      chain: "solana",
      asset: "usdc",
      match: "solana-pay-reference",
    },
    endpoints: {
      pricing: "GET /api/v1/meter/pricing",
      pass: "POST /api/v1/meter/pass",
      watch: "POST /api/v1/meter/watch",
      scan: "POST /api/v1/meter/scan",
      preflight: "POST /api/v1/meter/preflight",
      report: "GET /api/v1/meter/report",
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
    pay_url: `solana:${invoice.pay_to}?amount=${METER_PASS_1H.price_usd}&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&reference=${invoice.reference}&label=Agent%20Control&message=Pay%20%240.25`,
    next: "Pay 0.25 USDC on Solana with the reference, then POST /api/v1/meter/pass { invoice_id } — no human. Helius also mints when the transfer lands.",
  };
}
