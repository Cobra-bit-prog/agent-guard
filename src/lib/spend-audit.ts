/**
 * Wallet Spend Audit — Human App adjacent $49 one-shot.
 * Not Agent Meter. Not Starter. Growth $49 does not exist in billing.
 * Locked payouts match Meter / Human App. Query strings cannot retarget funds.
 */

import {
  CONNECT_PAY_CTA,
  CONNECT_PAY_HREF,
  CONNECT_TRIAL_CTA,
  CONNECT_TRIAL_HREF,
} from "./connect-path.ts";
import { EVM_PAYOUT_ADDRESS, lockedEvmUsdcRecipient } from "./evm-pay.ts";
import {
  BASE_CAIP2,
  BASE_USDC,
  BASE_USDC_EIP712_NAME,
  BASE_USDC_EIP712_VERSION,
  BASE_X402_NETWORK,
  METER_X402_MAX_TIMEOUT_SEC,
  type MeterExactAccept,
} from "./meter/accepts.ts";
import { evaluatePreflightSelf, utcDayKey } from "./meter/preflight.ts";
import { evaluateScan, type MeterChain, type ScanRisk } from "./meter/scan.ts";
import { validateMeterAddress } from "./meter/address.ts";
import type { AuditKind, AuditSnapshot } from "./audit-report.ts";
import {
  PAY_EXPIRY_MS,
  SOLANA_PAYOUT_ADDRESS,
  USDC_MINT,
  buildSolanaPayUrl,
  lockedSolanaUsdcRecipient,
  usdcBaseUnits,
} from "./solana-pay.ts";

export const SPEND_AUDIT_SKU = "wallet_spend_audit" as const;
export const SPEND_AUDIT_PRICE_USD = 49;
export const SPEND_AUDIT_AMOUNT_BASE_UNITS = usdcBaseUnits(SPEND_AUDIT_PRICE_USD);
export const SPEND_AUDIT_LOOKBACK_DAYS = 30;
/** Hypothetical Starter-like daily cap used only to flag over-cap patterns. */
export const SPEND_AUDIT_DAILY_CAP_USD = 100;
export const SPEND_AUDIT_PATH = "/spend-audit";
export const SPEND_AUDIT_PAY_PATH = "/spend-audit/pay";
export const SPEND_AUDIT_PRICING_PATH = "/api/v1/audit/pricing";
export const SPEND_AUDIT_INVOICE_PATH = "/api/v1/audit/invoice";
export const SPEND_AUDIT_WATCH_PATH = "/api/v1/audit/watch";

export const SPEND_AUDIT_PRODUCT = "Wallet Spend Audit";
export const SPEND_AUDIT_HEADLINE = "External audit for your agents";
export const SPEND_AUDIT_LEDE =
  "They ask before they pay. You keep the keys. Within policy = auto. Outside policy = stop.";
export const SPEND_AUDIT_HONESTY = "You keep the keys. Meter is separate — never mix.";
export const SPEND_AUDIT_SCANNER = "Not a package scanner.";
export const SPEND_AUDIT_UPSELL =
  "Started on Starter? Wallet Spend Audit adds clearer audit reports when you need proof of what your agents tried to pay.";
export const SPEND_AUDIT_STARTER_HREF = CONNECT_PAY_HREF;
export const SPEND_AUDIT_TRIAL_HREF = CONNECT_TRIAL_HREF;
export const SPEND_AUDIT_TRIAL_CTA = CONNECT_TRIAL_CTA;
export const SPEND_AUDIT_PAY29_CTA = CONNECT_PAY_CTA;
export const SPEND_AUDIT_DISCLAIMER =
  "Wallet Spend Audit: recent outbound transfers in the lookback window. Over-cap days use a hypothetical $100/day cap. Not a package scanner. You keep the keys. Not a live policy and not a full chain replay.";

export const SPEND_AUDIT_SIGN =
  "Sign USDC on YOUR machine. Prefer Base EIP-3009 exact to base_pay_to. Solana: pay_to WITH the reference. We never take keys.";

export type SpendAuditChain = MeterChain;

export type SpendAuditTransfer = {
  hash: string;
  from: string;
  to: string;
  valueUsd: number;
  timestamp: string;
  status: "success" | "failed";
  kind: string;
};

export type SpendAuditFindingKind = "over_cap" | "unknown_destination" | "sink";

export type SpendAuditFinding = {
  kind: SpendAuditFindingKind;
  to: string;
  amountUsd: number | null;
  day: string | null;
  risk: ScanRisk | null;
  detail: string;
};

export type SpendAuditRow = {
  timestamp: string;
  kind: "send" | "finding";
  chain: SpendAuditChain;
  to: string;
  amountUsd: number | null;
  result: string;
  detail: string;
};

export type SpendAuditSnapshot = {
  generatedAt: string;
  disclaimer: string;
  title: string;
  summary: string[];
  wallet: {
    address: string;
    chain: SpendAuditChain;
  };
  lookbackDays: number;
  dailyCapUsd: number;
  outboundCount: number;
  outboundUsd: number;
  findings: SpendAuditFinding[];
  rows: SpendAuditRow[];
};

export type SpendAuditInvoice = {
  invoice_id: string;
  reference: string;
  sku: typeof SPEND_AUDIT_SKU;
  pay_to: string;
  base_pay_to: string;
  amount_usd: number;
  amount_base_units: string;
  chain: SpendAuditChain;
  address: string;
  lookback_days: number;
  asset: "usdc";
  status: "pending" | "paid" | "expired" | "underpaid";
  signature: string | null;
  paid_amount_usd: number | null;
  payer_address: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  snapshot: SpendAuditSnapshot | null;
};

export function spendAuditPayPage(invoiceId: string): string {
  return `https://agent-control.net${SPEND_AUDIT_PAY_PATH}?invoice_id=${encodeURIComponent(invoiceId)}`;
}

export function spendAuditWatchUrl(): string {
  return `https://agent-control.net${SPEND_AUDIT_WATCH_PATH}`;
}

export function inferSpendAuditChain(address: string): SpendAuditChain | null {
  const trimmed = address.trim();
  if (validateMeterAddress("base", trimmed).ok) return "base";
  if (validateMeterAddress("solana", trimmed).ok) return "solana";
  return null;
}

export function parseSpendAuditChain(raw: unknown, address: string): SpendAuditChain | { error: string } {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  if (trimmed === "solana" || trimmed === "ethereum" || trimmed === "base") {
    const check = validateMeterAddress(trimmed, address);
    if (!check.ok) return { error: "invalid_address" };
    return trimmed;
  }
  const inferred = inferSpendAuditChain(address);
  if (!inferred) return { error: "invalid_address" };
  return inferred;
}

export function spendAuditPricing() {
  return {
    product: SPEND_AUDIT_PRODUCT,
    sku: SPEND_AUDIT_SKU,
    price_usd: SPEND_AUDIT_PRICE_USD,
    amount_base_units: SPEND_AUDIT_AMOUNT_BASE_UNITS,
    lookback_days: SPEND_AUDIT_LOOKBACK_DAYS,
    daily_cap_usd: SPEND_AUDIT_DAILY_CAP_USD,
    headline: SPEND_AUDIT_HEADLINE,
    lede: SPEND_AUDIT_LEDE,
    note: SPEND_AUDIT_HONESTY,
    scanner: SPEND_AUDIT_SCANNER,
    upsell: SPEND_AUDIT_UPSELL,
    pay_to: lockedSolanaUsdcRecipient(),
    base_pay_to: lockedEvmUsdcRecipient(),
    starter: {
      price_usd: 29,
      href: SPEND_AUDIT_STARTER_HREF,
      copy: SPEND_AUDIT_UPSELL,
      cta: SPEND_AUDIT_PAY29_CTA,
    },
    trial_href: SPEND_AUDIT_TRIAL_HREF,
    funds: {
      pay_to: SOLANA_PAYOUT_ADDRESS,
      base_pay_to: EVM_PAYOUT_ADDRESS,
      asset: "usdc" as const,
    },
    endpoints: {
      pricing: `GET ${SPEND_AUDIT_PRICING_PATH}`,
      invoice: `POST ${SPEND_AUDIT_INVOICE_PATH}`,
      watch: `POST ${SPEND_AUDIT_WATCH_PATH}`,
      report: "GET /api/v1/audit/report/:id",
      page: SPEND_AUDIT_PATH,
    },
  };
}

function auditExactAccepts(invoice: {
  invoice_id: string;
  reference: string;
  amount_base_units: string;
  amount_usd: number;
}): MeterExactAccept[] {
  const amount = invoice.amount_base_units;
  const extraBase = {
    sku: SPEND_AUDIT_SKU,
    price_usd: invoice.amount_usd,
    invoice_id: invoice.invoice_id,
    reference: invoice.reference,
    product: SPEND_AUDIT_PRODUCT,
  };
  const solana: MeterExactAccept = {
    scheme: "exact",
    network: "solana",
    amount,
    payTo: lockedSolanaUsdcRecipient(),
    asset: USDC_MINT,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra: {
      ...extraBase,
      symbol: "USDC",
      decimals: 6,
      match: "solana-pay-reference",
      headline: SPEND_AUDIT_HEADLINE,
    },
  };
  const base: MeterExactAccept = {
    scheme: "exact",
    network: BASE_X402_NETWORK,
    amount,
    payTo: lockedEvmUsdcRecipient(),
    asset: BASE_USDC,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra: {
      ...extraBase,
      symbol: "USDC",
      decimals: 6,
      name: BASE_USDC_EIP712_NAME,
      version: BASE_USDC_EIP712_VERSION,
      assetTransferMethod: "eip3009",
      caip2: BASE_CAIP2,
      headline: SPEND_AUDIT_HEADLINE,
    },
  };
  return [base, solana];
}

export function spendAudit402Body(invoice: SpendAuditInvoice) {
  const accepts = auditExactAccepts(invoice);
  return {
    error: "payment_required",
    http: 402,
    product: SPEND_AUDIT_PRODUCT,
    sku: SPEND_AUDIT_SKU,
    price_usd: SPEND_AUDIT_PRICE_USD,
    asset: "usdc" as const,
    pay_to: lockedSolanaUsdcRecipient(invoice.pay_to),
    base_pay_to: lockedEvmUsdcRecipient(),
    amount_usd: invoice.amount_usd,
    amount_base_units: invoice.amount_base_units,
    invoice_id: invoice.invoice_id,
    reference: invoice.reference,
    address: invoice.address,
    chain: invoice.chain,
    lookback_days: invoice.lookback_days,
    headline: SPEND_AUDIT_HEADLINE,
    note: SPEND_AUDIT_HONESTY,
    scanner: SPEND_AUDIT_SCANNER,
    upsell: SPEND_AUDIT_UPSELL,
    starter: {
      price_usd: 29,
      href: SPEND_AUDIT_STARTER_HREF,
      copy: SPEND_AUDIT_UPSELL,
      cta: SPEND_AUDIT_PAY29_CTA,
    },
    accepts,
    pay_url: buildSolanaPayUrl({
      recipient: lockedSolanaUsdcRecipient(),
      amountUsdc: invoice.amount_usd,
      reference: invoice.reference,
      planName: SPEND_AUDIT_PRODUCT,
    }),
    watch_url: spendAuditWatchUrl(),
    pay_page: spendAuditPayPage(invoice.invoice_id),
    sign: SPEND_AUDIT_SIGN,
    expiry_ms: PAY_EXPIRY_MS,
  };
}

export function spendAuditFileStem(address: string, generatedAt: string) {
  const day = generatedAt.slice(0, 10);
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18);
  return `wallet-spend-audit-${slug || "wallet"}-${day}`;
}

function sameAddr(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function analyzeSpend(input: {
  wallet: string;
  chain: SpendAuditChain;
  transfers: SpendAuditTransfer[];
  nowMs?: number;
  lookbackDays?: number;
  dailyCapUsd?: number;
  scan?: (address: string, chain: SpendAuditChain) => { risk: ScanRisk; reason: string };
}): SpendAuditSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const lookbackDays = input.lookbackDays ?? SPEND_AUDIT_LOOKBACK_DAYS;
  const dailyCapUsd = input.dailyCapUsd ?? SPEND_AUDIT_DAILY_CAP_USD;
  const scan =
    input.scan ??
    ((address: string, chain: SpendAuditChain) => {
      const hit = evaluateScan({ address, chain, nowMs });
      return { risk: hit.risk, reason: hit.reason };
    });
  const cutoff = nowMs - lookbackDays * 24 * 60 * 60 * 1000;
  const wallet = input.wallet.trim();

  const outbound = input.transfers
    .filter((tx) => sameAddr(tx.from, wallet))
    .filter((tx) => tx.status === "success")
    .filter((tx) => tx.valueUsd > 0)
    .filter((tx) => {
      const t = Date.parse(tx.timestamp);
      return Number.isFinite(t) ? t >= cutoff : true;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const byDay = new Map<string, number>();
  for (const tx of outbound) {
    const day = utcDayKey(Date.parse(tx.timestamp) || nowMs);
    byDay.set(day, (byDay.get(day) ?? 0) + Math.max(0, tx.valueUsd));
  }

  const findings: SpendAuditFinding[] = [];
  for (const [day, spent] of [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    if (spent <= dailyCapUsd) continue;
    const verdict = evaluatePreflightSelf({
      cap_usd: dailyCapUsd,
      value_usd: spent,
      spent_today_usd: 0,
    });
    if (verdict.decision === "stop") {
      findings.push({
        kind: "over_cap",
        to: "—",
        amountUsd: spent,
        day,
        risk: null,
        detail: `Would have exceeded a $${dailyCapUsd} daily cap (${day}: $${spent.toFixed(2)} out).`,
      });
    }
  }

  const seen = new Set<string>();
  for (const tx of outbound) {
    const key = tx.to.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const looked = scan(tx.to, input.chain);
    if (looked.risk === "sink") {
      findings.push({
        kind: "sink",
        to: tx.to,
        amountUsd: tx.valueUsd,
        day: utcDayKey(Date.parse(tx.timestamp) || nowMs),
        risk: looked.risk,
        detail: looked.reason,
      });
    } else if (looked.risk === "new" || looked.risk === "warn") {
      findings.push({
        kind: "unknown_destination",
        to: tx.to,
        amountUsd: tx.valueUsd,
        day: utcDayKey(Date.parse(tx.timestamp) || nowMs),
        risk: looked.risk,
        detail: looked.reason,
      });
    }
  }

  const outboundUsd = outbound.reduce((sum, tx) => sum + Math.max(0, tx.valueUsd), 0);
  const overCapDays = findings.filter((f) => f.kind === "over_cap").length;
  const unknown = findings.filter((f) => f.kind === "unknown_destination").length;
  const sinks = findings.filter((f) => f.kind === "sink").length;

  const rows: SpendAuditRow[] = [
    ...findings.map((f) => ({
      timestamp: f.day ? `${f.day}T00:00:00.000Z` : new Date(nowMs).toISOString(),
      kind: "finding" as const,
      chain: input.chain,
      to: f.to,
      amountUsd: f.amountUsd,
      result: f.kind,
      detail: f.detail,
    })),
    ...outbound.map((tx) => {
      const looked = scan(tx.to, input.chain);
      return {
        timestamp: tx.timestamp,
        kind: "send" as const,
        chain: input.chain,
        to: tx.to,
        amountUsd: tx.valueUsd,
        result: looked.risk,
        detail: `${tx.kind} · ${looked.reason}`,
      };
    }),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const generatedAt = new Date(nowMs).toISOString();
  const summary = [
    `${outbound.length} outbound transfer${outbound.length === 1 ? "" : "s"} · $${outboundUsd.toFixed(2)} in ${lookbackDays} days.`,
    `${overCapDays} over-cap day${overCapDays === 1 ? "" : "s"} vs a hypothetical $${dailyCapUsd}/day cap.`,
    `${unknown} unknown destination${unknown === 1 ? "" : "s"} · ${sinks} sink-like address${sinks === 1 ? "" : "es"}.`,
    SPEND_AUDIT_HONESTY,
    SPEND_AUDIT_SCANNER,
    SPEND_AUDIT_UPSELL,
  ];

  return {
    generatedAt,
    disclaimer: SPEND_AUDIT_DISCLAIMER,
    title: SPEND_AUDIT_HEADLINE,
    summary,
    wallet: { address: wallet, chain: input.chain },
    lookbackDays,
    dailyCapUsd,
    outboundCount: outbound.length,
    outboundUsd,
    findings,
    rows,
  };
}

export function snapshotToAuditTrail(snapshot: SpendAuditSnapshot): AuditSnapshot {
  return {
    generatedAt: snapshot.generatedAt,
    disclaimer: snapshot.disclaimer,
    title: snapshot.title,
    summary: snapshot.summary,
    emptyMessage: "No outbound transfers in the lookback window.",
    agent: {
      id: snapshot.wallet.address,
      name: SPEND_AUDIT_PRODUCT,
      address: snapshot.wallet.address,
      chain: snapshot.wallet.chain,
    },
    rows: snapshot.rows.map((row) => ({
      timestamp: row.timestamp,
      kind: trailKind(row),
      chain: row.chain,
      to: row.to,
      amountUsd: row.amountUsd,
      result: row.result,
      detail: row.detail,
    })),
  };
}

function trailKind(row: SpendAuditRow): AuditKind {
  if (row.kind !== "finding") return "send";
  return row.result === "over_cap" ? "alert" : "check";
}
