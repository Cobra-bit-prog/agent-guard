export const METER_PASS_SKU = "pass_1h" as const;

export type MeterSkuId = "pass_1h" | "pass_24h" | "calls_1k" | "stamp_tx" | "scan_batch";

export type MeterSku = {
  id: MeterSkuId;
  price_usd: number;
  duration_sec: number;
  included_calls: number;
  covers: readonly string[];
  asset: "usdc";
  chain: "solana";
  amount_base_units: string;
  job: string;
};

export const METER_PASS_1H: MeterSku = {
  id: METER_PASS_SKU,
  price_usd: 0.25,
  duration_sec: 3600,
  included_calls: 200,
  covers: ["scan", "preflight", "scan_batch", "stamp"],
  asset: "usdc",
  chain: "solana",
  amount_base_units: "250000",
  job: "Default session. Scan + preflight + batch + stamp.",
};

export const METER_SKUS: Record<MeterSkuId, MeterSku> = {
  pass_1h: METER_PASS_1H,
  pass_24h: {
    id: "pass_24h",
    price_usd: 1,
    duration_sec: 86400,
    included_calls: 2000,
    covers: ["scan", "preflight", "scan_batch", "stamp"],
    asset: "usdc",
    chain: "solana",
    amount_base_units: "1000000",
    job: "Overnight crawler session.",
  },
  calls_1k: {
    id: "calls_1k",
    price_usd: 0.8,
    duration_sec: 86400,
    included_calls: 1000,
    covers: ["scan", "preflight", "scan_batch", "stamp"],
    asset: "usdc",
    chain: "solana",
    amount_base_units: "800000",
    job: "Burst pack. Not a subscription.",
  },
  stamp_tx: {
    id: "stamp_tx",
    price_usd: 0.1,
    duration_sec: 600,
    included_calls: 1,
    covers: ["stamp"],
    asset: "usdc",
    chain: "solana",
    amount_base_units: "100000",
    job: "One signed allow|stop receipt a merchant can verify.",
  },
  scan_batch: {
    id: "scan_batch",
    price_usd: 0.15,
    duration_sec: 3600,
    included_calls: 1,
    covers: ["scan_batch"],
    asset: "usdc",
    chain: "solana",
    amount_base_units: "150000",
    job: "One batch of up to 100 addresses. Prefer a session pass if you scan more than once.",
  },
};

export const METER_SKU_IDS = Object.keys(METER_SKUS) as MeterSkuId[];

export function resolveMeterSku(raw: unknown): MeterSku | { error: "unknown_sku"; sku: string } {
  const sku = String(raw ?? METER_PASS_SKU).trim() || METER_PASS_SKU;
  const hit = METER_SKUS[sku as MeterSkuId];
  if (!hit) return { error: "unknown_sku", sku };
  return hit;
}

export function skuCovers(sku: string, kind: string): boolean {
  const hit = METER_SKUS[sku as MeterSkuId];
  return Boolean(hit?.covers.includes(kind));
}

export function meterPricing() {
  return {
    product: "Agent Meter",
    note: "No email. No API key. Pay a pass, then call scan and preflight. Human App ($29 Inbox) is separate.",
    default_sku: METER_PASS_SKU,
    pass: {
      id: METER_PASS_1H.id,
      price_usd: METER_PASS_1H.price_usd,
      duration_sec: METER_PASS_1H.duration_sec,
      included_calls: METER_PASS_1H.included_calls,
      covers: [...METER_PASS_1H.covers],
      asset: METER_PASS_1H.asset,
      chain: METER_PASS_1H.chain,
      amount_base_units: METER_PASS_1H.amount_base_units,
    },
    skus: METER_SKU_IDS.map((id) => {
      const row = METER_SKUS[id];
      return {
        id: row.id,
        price_usd: row.price_usd,
        duration_sec: row.duration_sec,
        included_calls: row.included_calls,
        covers: [...row.covers],
        asset: row.asset,
        chain: row.chain,
        amount_base_units: row.amount_base_units,
        job: row.job,
      };
    }),
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
      scan_batch: "POST /api/v1/meter/scan-batch",
      stamp: "POST /api/v1/meter/stamp",
      stamp_get: "GET /api/v1/meter/stamp/:id",
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
  sku?: string;
}) {
  const sku = (invoice.sku as MeterSkuId) || METER_PASS_SKU;
  const catalog = METER_SKUS[sku] ?? METER_PASS_1H;
  const price = invoice.amount_usd || catalog.price_usd;
  return {
    error: "payment_required",
    http: 402,
    sku: catalog.id,
    price_usd: catalog.price_usd,
    asset: invoice.asset,
    chain: invoice.chain,
    pay_to: invoice.pay_to,
    amount_usd: price,
    amount_base_units: invoice.amount_base_units,
    invoice_id: invoice.invoice_id,
    reference: invoice.reference,
    pay_url: `solana:${invoice.pay_to}?amount=${price}&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&reference=${invoice.reference}&label=Agent%20Control&message=Pay%20$${price}%20${catalog.id}`,
    next: `Pay ${price} USDC on Solana with the reference, then POST /api/v1/meter/watch { invoice_id } — no human. Helius also mints when the transfer lands.`,
  };
}
