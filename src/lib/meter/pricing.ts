import { SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { meterFundsAccepts, meterPaymentAccepts, meterPaymentRequiredAccepts } from "./accepts.ts";
import { METER_402_TOOL_FIELDS, METER_ADAPTER_SNIPPET, meter402SignExact } from "./sign-exact.ts";
import {
  assertMeterBazaarDescriptionBound,
  meterBazaarExtensions,
  meterBazaarKindFromSource,
  meterBazaarResource,
  type MeterBazaarKind,
} from "./bazaar.ts";

export const METER_LOOK_SKU = "look" as const;
export const METER_DEFAULT_SKU = METER_LOOK_SKU;
/** Primary paid door. Packs mint/extend X-Agent-Pass. No free looks. */
export const METER_PAID_SKU = "looks_20" as const;
/** @deprecated Default door is `look`. pass_1h stays in catalog only. */
export const METER_PASS_SKU = "pass_1h" as const;

export const METER_FREE_LOOKS = 0;
export const METER_LOOK_USD = 0.1;
export const METER_LOOK_USD_LABEL = "0.10";
export const METER_LOOKS_20_USD = 0.2;
export const METER_LOOKS_20_USD_LABEL = "0.20";
export const METER_ANON_IDENTITY = "anon" as const;

export const LOOK_QUESTION = "Can I pay this address?";
export const LOOK_RISKS = ["ok", "new", "warn", "sink"] as const;
/** Paid-first door. looks_20 is the pack; look is the one-shot. No free looks. */
export const METER_PAID_DOOR =
  "Buy looks_20 pack ($0.20) or look $0.10. Stamp ticket $0.05.";
export const METER_FREE_THEN_LOOK = METER_PAID_DOOR;
/** Primary paid path. look $0.10 remains an optional one-shot. */
export const METER_PACKS_FIRST = METER_PAID_DOOR;
/** Agent-facing discovery lead. Paid pack first. */
export const METER_AGENT_LEAD = `${LOOK_QUESTION} ${METER_PAID_DOOR} No inbox.`;
export const STAMP_TICKET_COPY = "Take this ticket or we do not take your USDC.";
/** Seller-facing lock. Same line as the ticket. */
export const STAMP_MERCHANT_COPY = STAMP_TICKET_COPY;

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
  amount_base_units: "100000",
  job: "One look. One address. Can I pay this address?",
};

export const METER_LOOKS_20: MeterSku = {
  id: "looks_20",
  price_usd: METER_LOOKS_20_USD,
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
  return METER_LOOKS_20;
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
    note: `${METER_PACKS_FIRST} ${LOOK_QUESTION} Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05. ${STAMP_MERCHANT_COPY} Base USDC (EIP-3009 exact) and Solana USDC. No email. No API key. Human App ($29 Inbox) is separate.`,
    default_sku: METER_DEFAULT_SKU,
    paid_sku: METER_PAID_SKU,
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
      merchant: STAMP_MERCHANT_COPY,
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
    funds: meterFundsAccepts(),
    endpoints: {
      pricing: "GET /api/v1/meter/pricing",
      pass: "GET or POST /api/v1/meter/pass",
      watch: "POST /api/v1/meter/watch",
      scan: "POST /api/v1/meter/scan",
      preflight: "POST /api/v1/meter/preflight",
      scan_batch: "POST /api/v1/meter/scan-batch",
      stamp: "POST /api/v1/meter/stamp",
      stamp_get: "GET /api/v1/meter/stamp/:id",
      gate_demo: "GET or POST /api/v1/gate/demo",
      report: "GET /api/v1/meter/report",
    },
    header: "X-Agent-Pass",
    identity: "X-Agent-Pass or anon. No email.",
    discovery: "llms → pricing → 402 → MCP",
  };
}

/** Public watch door. Amounts always come from the live catalog row, not a frozen price. */
export const METER_WATCH_PATH = "/api/v1/meter/watch";
export const METER_WATCH_URL = `https://agent-control.net${METER_WATCH_PATH}`;
/** Public raw adapter. Site paths 404; agents must fetch this URL, not copy from the homepage. */
export const METER_ADAPTER_URL =
  "https://raw.githubusercontent.com/Cobra-bit-prog/agent-guard/main/src/adapters/meter-pay.ts";
/** Base EIP-3009 exact buyer. No Solana key. CDP / AgentKit / viem signExact. */
export const METER_BASE_ADAPTER_URL =
  "https://raw.githubusercontent.com/Cobra-bit-prog/agent-guard/main/src/adapters/meter-pay-base.ts";
export const METER_PREFERRED_RAIL = "base" as const;
export const METER_NEXT_TOOL = "meter_watch" as const;
export const METER_402_SIGN =
  `${METER_PACKS_FIRST} Prefer Base USDC EIP-3009 exact to base_pay_to (CDP/AgentKit; no Solana key). Use sign_exact + adapter_snippet in this invoice — finish in-process (payMeterPassBase / signTypedData). Fetch base_adapter_url (buyMeterPassBase) only if you need the full file. Solana: pay_to WITH the reference. Fetch adapter_url (buyMeterPass / payMeterPass). We never take keys.`;

export function meter402PayPage(invoiceId: string): string {
  return `https://agent-control.net/meter/pay?invoice_id=${invoiceId}`;
}

export function meter402NextSteps(invoiceId: string): string[] {
  return [
    "On YOUR machine, signExact EIP-3009 TransferWithAuthorization to base_pay_to (CDP/AgentKit/viem). Use sign_exact.domain + types + authorization (fill from, nonce, validBefore). Or run adapter_snippet (payMeterPassBase). No Solana key needed. We never take keys.",
    `Call meter_watch({ "invoice_id":"${invoiceId}", payment }) until token. payment is the x402 v2 object from payMeterPassBase / adapter_snippet / sign_exact.payment_template after you fill signature — never a bare signature string. Shape: { x402Version:2, payload:{ authorization, signature }, accepted:{ network:"base", extra:{ invoice_id, reference } } }.`,
    "Retry meter_scan with that token as pass_token / X-Agent-Pass.",
    "Optional: fetch base_adapter_url (buyMeterPassBase) or adapter_url / pay_page if you are not signing in-process.",
  ];
}

export function meter402Next(invoiceId: string): string {
  return `1) On YOUR machine: signExact EIP-3009 to base_pay_to (CDP/AgentKit; no Solana key). Use sign_exact + adapter_snippet (payMeterPassBase). 2) Call meter_watch({ "invoice_id":"${invoiceId}", payment }) until token. payment is the x402 v2 object from payMeterPassBase / sign_exact.payment_template after you fill signature — never a bare signature string. Shape: { x402Version:2, payload:{ authorization, signature }, accepted:{ network:"base", extra:{ invoice_id, reference } } }. 3) Retry meter_scan with that token as pass_token / X-Agent-Pass. 4) Optional: fetch base_adapter_url or adapter_url / pay_page. ${METER_PACKS_FIRST}`;
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
}, discovery?: Meter402Discovery) {
  const sku = (invoice.sku as MeterSkuId) || METER_DEFAULT_SKU;
  const catalog = METER_SKUS[sku] ?? METER_LOOK;
  const price = invoice.amount_usd || catalog.price_usd;
  const amountBase = invoice.amount_base_units || catalog.amount_base_units;
  const kind = bazaarKindOf(discovery);
  const resource = meterBazaarResource(kind);
  const description = assertMeterBazaarDescriptionBound(resource.description);
  const accepts = meterPaymentAccepts(
    {
      invoice_id: invoice.invoice_id,
      reference: invoice.reference,
      amount_base_units: amountBase,
      sku: catalog.id,
      amount_usd: price,
    },
    catalog,
  );
  return {
    error: "payment_required",
    http: 402,
    sku: catalog.id,
    paid_sku: METER_PAID_SKU,
    price_usd: catalog.price_usd,
    asset: invoice.asset,
    chain: invoice.chain,
    pay_to: SOLANA_PAYOUT_ADDRESS,
    base_pay_to: EVM_PAYOUT_ADDRESS,
    amount_usd: price,
    amount_base_units: amountBase,
    invoice_id: invoice.invoice_id,
    reference: invoice.reference,
    question: LOOK_QUESTION,
    note: catalog.id === "stamp_tx" ? STAMP_TICKET_COPY : METER_PACKS_FIRST,
    description,
    resource,
    extensions: meterBazaarExtensions(kind),
    packs: {
      looks_20: { price_usd: METER_LOOKS_20.price_usd, included_calls: METER_LOOKS_20.included_calls },
      addresses_100: { price_usd: METER_ADDRESSES_100.price_usd, included_calls: METER_ADDRESSES_100.included_calls },
    },
    accepts,
    pay_url: `solana:${SOLANA_PAYOUT_ADDRESS}?amount=${price}&spl-token=${USDC_MINT}&reference=${invoice.reference}&label=Agent%20Control&message=Pay%20$${price}%20${catalog.id}`,
    watch_url: METER_WATCH_URL,
    adapter_url: METER_ADAPTER_URL,
    base_adapter_url: METER_BASE_ADAPTER_URL,
    preferred_rail: METER_PREFERRED_RAIL,
    pay_page: meter402PayPage(invoice.invoice_id),
    next_tool: METER_NEXT_TOOL,
    tool_fields: [...METER_402_TOOL_FIELDS],
    sign_exact: meter402SignExact({
      invoice_id: invoice.invoice_id,
      reference: invoice.reference,
      amount_base_units: amountBase,
    }),
    adapter_snippet: METER_ADAPTER_SNIPPET,
    sign: METER_402_SIGN,
    next: meter402Next(invoice.invoice_id),
    next_steps: meter402NextSteps(invoice.invoice_id),
  };
}

export type Meter402Invoice = {
  invoice_id: string;
  pay_to: string;
  reference: string;
  amount_usd: number;
  amount_base_units: string;
  chain: string;
  asset: string;
  sku?: string;
};

export type Meter402Discovery = {
  kind?: MeterBazaarKind;
  source?: string | null;
};

function bazaarKindOf(discovery?: Meter402Discovery): MeterBazaarKind {
  if (discovery?.kind) return discovery.kind;
  return meterBazaarKindFromSource(discovery?.source);
}

function catalogAcceptInvoice(invoice: Meter402Invoice, catalog: MeterSku) {
  return {
    invoice_id: invoice.invoice_id,
    reference: invoice.reference,
    amount_base_units: invoice.amount_base_units || catalog.amount_base_units,
    sku: catalog.id,
    amount_usd: invoice.amount_usd || catalog.price_usd,
  };
}

export function meter402PaymentRequiredPayload(invoice: Meter402Invoice, discovery?: Meter402Discovery) {
  const sku = (invoice.sku as MeterSkuId) || METER_DEFAULT_SKU;
  const catalog = METER_SKUS[sku] ?? METER_LOOK;
  const kind = bazaarKindOf(discovery);
  const resource = meterBazaarResource(kind);
  const description = assertMeterBazaarDescriptionBound(resource.description);
  return {
    x402Version: 2,
    error: "Payment required",
    description,
    resource: { ...resource, description },
    accepts: meterPaymentRequiredAccepts(catalogAcceptInvoice(invoice, catalog), catalog, resource.url),
    extensions: meterBazaarExtensions(kind),
  };
}

export function meter402ChallengeHeaders(
  invoice: Meter402Invoice,
  discovery?: Meter402Discovery,
): Record<string, string> {
  const sku = (invoice.sku as MeterSkuId) || METER_DEFAULT_SKU;
  const catalog = METER_SKUS[sku] ?? METER_LOOK;
  const price = invoice.amount_usd || catalog.price_usd;
  const payTo = SOLANA_PAYOUT_ADDRESS;
  return {
    "PAYMENT-REQUIRED": Buffer.from(
      JSON.stringify(meter402PaymentRequiredPayload(invoice, discovery)),
      "utf8",
    ).toString("base64"),
    "WWW-Authenticate": `Payment realm="Agent Meter", chain="solana", token="USDC", amount="${price}", address="${payTo}", reference="${invoice.reference}"`,
    "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, WWW-Authenticate",
  };
}
