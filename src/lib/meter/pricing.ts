export const METER_LOOK_SKU = "look" as const;
export const METER_DEFAULT_SKU = METER_LOOK_SKU;
/** @deprecated Default door is `look`. pass_1h stays in catalog only. */
export const METER_PASS_SKU = "pass_1h" as const;

export const METER_FREE_LOOKS = 5;
export const METER_LOOK_USD = 0.02;
export const METER_ANON_IDENTITY = "anon" as const;

export const LOOK_QUESTION = "Can I pay this address?";
export const LOOK_RISKS = ["ok", "new", "warn", "sink"] as const;
export const METER_FREE_THEN_LOOK = "First 5 free. Then $0.02 USDC.";
export const STAMP_TICKET_COPY = "Take this ticket or we do not take your USDC.";

export type MeterSkuId = "look" | "looks_20" | "addresses_100" | "stamp_tx" | "pass_1h";

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

export const METER_LOOK: MeterSku = {
  id: METER_LOOK_SKU,
  price_usd: METER_LOOK_USD,
  duration_sec: 600,
  included_calls: 1,
  covers: ["scan", "preflight"],
  asset: "usdc",
  chain: "solana",
  amount_base_units: "20000",
  job: "One look. One address. Can I pay this address?",
};

export const METER_LOOKS_20: MeterSku = {
  id: "looks_20",
  price_usd: 0.2,
  duration_sec: 86400,
  included_calls: 20,
  covers: ["scan", "preflight"],
  asset: "usdc",
  chain: "solana",
  amount_base_units: "200000",
  job: "Pack of 20 looks.",
};

export const METER_ADDRESSES_100: MeterSku = {
  id: "addresses_100",
  price_usd: 0.15,
  duration_sec: 3600,
  included_calls: 1,
  covers: ["scan_batch"],
  asset: "usdc",
  chain: "solana",
  amount_base_units: "150000",
  job: "One batch of up to 100 addresses.",
};

export const METER_STAMP_TX: MeterSku = {
  id: "stamp_tx",
  price_usd: 0.05,
  duration_sec: 600,
  included_calls: 1,
  covers: ["stamp"],
  asset: "usdc",
  chain: "solana",
  amount_base_units: "50000",
  job: STAMP_TICKET_COPY,
};

/** Catalog-only. Not the default door. */
export const METER_PASS_1H: MeterSku = {
  id: METER_PASS_SKU,
  price_usd: 0.25,
  duration_sec: 3600,
  included_calls: 200,
  covers: ["scan", "preflight", "scan_batch", "stamp"],
  asset: "usdc",
  chain: "solana",
  amount_base_units: "250000",
  job: "Optional session pack. Scan + preflight + batch + stamp.",
};

export const METER_SKUS: Record<MeterSkuId, MeterSku> = {
  look: METER_LOOK,
  looks_20: METER_LOOKS_20,
  addresses_100: METER_ADDRESSES_100,
  stamp_tx: METER_STAMP_TX,
  pass_1h: METER_PASS_1H,
};

export const METER_SKU_IDS = Object.keys(METER_SKUS) as MeterSkuId[];

export function defaultSkuForKind(kind: string): MeterSku {
  if (kind === "stamp") return METER_STAMP_TX;
  if (kind === "scan_batch") return METER_ADDRESSES_100;
  return METER_LOOK;
}

export function resolveMeterSku(raw: unknown): MeterSku | { error: "unknown_sku"; sku: string } {
  const sku = String(raw ?? METER_DEFAULT_SKU).trim() || METER_DEFAULT_SKU;
  const hit = METER_SKUS[sku as MeterSkuId];
  if (!hit) return { error: "unknown_sku", sku };
  return hit;
}

/** Unknown/empty sku falls back to the default look catalog row. */
export function meterSkuOrDefault(raw: unknown): MeterSku {
  const hit = resolveMeterSku(raw);
  return "error" in hit ? METER_LOOK : hit;
}

export function coversForSku(sku: string): string[] {
  return [...(METER_SKUS[sku as MeterSkuId]?.covers ?? METER_LOOK.covers)];
}

export function skuCovers(sku: string, kind: string): boolean {
  const hit = METER_SKUS[sku as MeterSkuId];
  return Boolean(hit?.covers.includes(kind));
}

export function meterPricing() {
  return {
    product: "Agent Meter",
    question: LOOK_QUESTION,
    risks: [...LOOK_RISKS],
    note: `${LOOK_QUESTION} ${METER_FREE_THEN_LOOK} No email. No API key. Human App ($29 Inbox) is separate.`,
    default_sku: METER_DEFAULT_SKU,
    free_looks: METER_FREE_LOOKS,
    look: {
      id: METER_LOOK.id,
      price_usd: METER_LOOK.price_usd,
      duration_sec: METER_LOOK.duration_sec,
      included_calls: METER_LOOK.included_calls,
      covers: [...METER_LOOK.covers],
      asset: METER_LOOK.asset,
      chain: METER_LOOK.chain,
      amount_base_units: METER_LOOK.amount_base_units,
    },
    pass: {
      id: METER_LOOK.id,
      price_usd: METER_LOOK.price_usd,
      duration_sec: METER_LOOK.duration_sec,
      included_calls: METER_LOOK.included_calls,
      covers: [...METER_LOOK.covers],
      asset: METER_LOOK.asset,
      chain: METER_LOOK.chain,
      amount_base_units: METER_LOOK.amount_base_units,
    },
    packs: {
      looks_20: { price_usd: METER_LOOKS_20.price_usd, included_calls: METER_LOOKS_20.included_calls },
      addresses_100: { price_usd: METER_ADDRESSES_100.price_usd, included_calls: METER_ADDRESSES_100.included_calls },
    },
    ticket: {
      sku: METER_STAMP_TX.id,
      price_usd: METER_STAMP_TX.price_usd,
      copy: STAMP_TICKET_COPY,
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
    identity: "X-Agent-Pass or anon. No email.",
    discovery: "llms → pricing → 402 → MCP",
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
  const sku = (invoice.sku as MeterSkuId) || METER_DEFAULT_SKU;
  const catalog = METER_SKUS[sku] ?? METER_LOOK;
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
    question: LOOK_QUESTION,
    note: catalog.id === "stamp_tx" ? STAMP_TICKET_COPY : METER_FREE_THEN_LOOK,
    pay_url: `solana:${invoice.pay_to}?amount=${price}&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&reference=${invoice.reference}&label=Agent%20Control&message=Pay%20$${price}%20${catalog.id}`,
    next: `Pay ${price} USDC on Solana with the reference, then POST /api/v1/meter/watch { invoice_id }.`,
  };
}
