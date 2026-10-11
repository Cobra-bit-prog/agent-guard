import { randomBytes } from "node:crypto";
import { clientIp, type ListingQuery } from "../directory/listings.ts";
import { lockedEvmUsdcRecipient } from "../evm-pay.ts";
import {
  BASE_CAIP2,
  BASE_USDC,
  BASE_USDC_EIP712_NAME,
  BASE_USDC_EIP712_VERSION,
  BASE_X402_NETWORK,
  METER_X402_MAX_TIMEOUT_SEC,
  type MeterExactAccept,
} from "../meter/accepts.ts";
import type { MeterChainFinder } from "../meter/settle.ts";
import {
  exactEvmFailureBody,
  invoiceIdFromPayment,
  readX402Payment,
  referenceFromPayment,
  settleExactEvmPayment,
  type ExactEvmSettler,
} from "../meter/x402-evm.ts";
import { PAY_EXPIRY_MS, SOLANA_PAYOUT_ADDRESS, USDC_MINT, buildSolanaPayUrl, lockedSolanaUsdcRecipient } from "../solana-pay.ts";
import { json } from "../server/http.ts";
import { SsrfError } from "../x402-check/ssrf.ts";
import {
  AGENT_CHECK_DAYS,
  AGENT_CHECK_HONESTY,
  AGENT_CHECK_LINE,
  AGENT_CHECK_PAY_LINE,
  AGENT_CHECK_PRICE_USD,
  AGENT_CHECK_REPORT_PATH,
  AGENT_CHECK_RUNS,
  AGENT_CHECK_SKU,
} from "./copy.ts";
import {
  AGENT_CHECK_AMOUNT_BASE_UNITS,
  AgentCheckError,
  assertAgentFreeRate,
  expireAgentOrder,
  getAgentOrder,
  grantAgentPay,
  hashAgentIp,
  isAgentSchemaMissing,
  noteAgentUnderpaid,
  parseSiteUrl,
  recheckOpen,
  saveAgentReport,
  startAgentPay,
  type AgentOrder,
} from "./pay.ts";
import { runAgentCheck, type AgentReport } from "./run.ts";

export type AgentPayDeps = {
  findPayment?: MeterChainFinder;
  settleExactEvm?: ExactEvmSettler;
  runFree?: (url: string, sql: ListingQuery | null) => Promise<AgentReport>;
  runReport?: (url: string, sql: ListingQuery | null) => Promise<AgentReport>;
};

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function acceptsFor(order: AgentOrder): MeterExactAccept[] {
  const extra = {
    sku: AGENT_CHECK_SKU,
    price_usd: AGENT_CHECK_PRICE_USD,
    invoice_id: order.id,
    reference: order.reference,
    target: order.target,
    symbol: "USDC",
    decimals: 6,
  };
  const base: MeterExactAccept = {
    scheme: "exact",
    network: BASE_X402_NETWORK,
    amount: order.amount_base_units,
    payTo: lockedEvmUsdcRecipient(),
    asset: BASE_USDC,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra: {
      ...extra,
      name: BASE_USDC_EIP712_NAME,
      version: BASE_USDC_EIP712_VERSION,
      assetTransferMethod: "eip3009",
      caip2: BASE_CAIP2,
    },
  };
  const solana: MeterExactAccept = {
    scheme: "exact",
    network: "solana",
    amount: order.amount_base_units,
    payTo: lockedSolanaUsdcRecipient(),
    asset: USDC_MINT,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra: { ...extra, match: "solana-pay-reference" },
  };
  return [base, solana];
}

function rechecksLeft(order: AgentOrder, now: Date): number {
  if (order.status !== "paid" || !order.report_until) return 0;
  if (new Date(order.report_until).getTime() <= now.getTime()) return 0;
  return Math.max(0, AGENT_CHECK_RUNS - order.runs_used);
}

export function agentInvoiceView(order: AgentOrder, now: Date, recorded = true) {
  let report: AgentReport | null = null;
  if (order.report_json) {
    try {
      report = JSON.parse(order.report_json) as AgentReport;
    } catch {
      report = null;
    }
  }
  return {
    invoice_id: order.id,
    target: order.target,
    target_kind: order.target_kind,
    sku: AGENT_CHECK_SKU,
    price_usd: AGENT_CHECK_PRICE_USD,
    days: AGENT_CHECK_DAYS,
    amount_usd: AGENT_CHECK_PRICE_USD,
    amount_base_units: AGENT_CHECK_AMOUNT_BASE_UNITS,
    asset: "usdc" as const,
    status: order.status,
    reference: order.reference,
    pay_to: lockedSolanaUsdcRecipient(),
    base_pay_to: lockedEvmUsdcRecipient(),
    pay_url: buildSolanaPayUrl({ amountUsdc: AGENT_CHECK_PRICE_USD, reference: order.reference }),
    accepts: acceptsFor(order),
    tx_ref: order.tx_ref,
    paid_at: order.paid_at,
    report_until: order.report_until,
    runs_used: order.runs_used,
    rechecks_left: rechecksLeft(order, now),
    recorded,
    line: AGENT_CHECK_LINE,
    note: AGENT_CHECK_HONESTY,
    pay: AGENT_CHECK_PAY_LINE,
    watch_url: `https://agent-control.net${AGENT_CHECK_REPORT_PATH}`,
    ...(report ? { report } : {}),
  };
}

function pricingBody() {
  return {
    sku: AGENT_CHECK_SKU,
    price_usd: AGENT_CHECK_PRICE_USD,
    days: AGENT_CHECK_DAYS,
    amount_base_units: AGENT_CHECK_AMOUNT_BASE_UNITS,
    asset: "usdc" as const,
    pay_to: SOLANA_PAYOUT_ADDRESS,
    base_pay_to: lockedEvmUsdcRecipient(),
    chains: ["base", "solana"] as const,
    line: AGENT_CHECK_LINE,
    note: AGENT_CHECK_HONESTY,
    pay: AGENT_CHECK_PAY_LINE,
    endpoint: `POST ${AGENT_CHECK_REPORT_PATH}`,
    free: "POST /api/v1/agent-check",
  };
}

function invoiceKey(body: Record<string, unknown>, payment: Record<string, unknown> | null): string {
  const fromPayment = payment ? invoiceIdFromPayment(payment) || referenceFromPayment(payment) : "";
  const fromBody = String(body.invoice_id ?? body.invoiceId ?? body.reference ?? "").trim();
  return (fromPayment || fromBody).slice(0, 120);
}

async function attachReport(sql: ListingQuery, order: AgentOrder, runsUsed: number, deps: AgentPayDeps): Promise<AgentOrder> {
  const runner = deps.runReport ?? ((url, db) => runAgentCheck(url, "full", { sql: db }));
  const report = await runner(order.target, sql);
  const saved = await saveAgentReport(sql, order.id, JSON.stringify(report), runsUsed);
  return saved ?? { ...order, report_json: JSON.stringify(report), runs_used: runsUsed };
}

async function watchOrder(
  sql: ListingQuery,
  order: AgentOrder,
  request: Request,
  body: Record<string, unknown>,
  deps: AgentPayDeps,
  now: Date,
): Promise<Response> {
  const wantsRecheck = body.recheck === true;
  if (order.status === "paid") {
    if (wantsRecheck) {
      if (!recheckOpen(order, now) || order.runs_used < 1) {
        return json(
          {
            ...agentInvoiceView(order, now),
            error: order.runs_used >= AGENT_CHECK_RUNS
              ? "The free re-check was already used."
              : "The 7 days are over. Start a new report.",
          },
          402,
        );
      }
      const updated = await attachReport(sql, order, order.runs_used + 1, deps);
      return json(agentInvoiceView(updated, now));
    }
    if (order.runs_used === 0 || !order.report_json) {
      const updated = await attachReport(sql, order, 1, deps);
      return json(agentInvoiceView(updated, now));
    }
    return json(agentInvoiceView(order, now));
  }
  if (order.status === "expired") {
    return json({ ...agentInvoiceView(order, now), error: "This payment window closed. Start again." }, 402);
  }
  if (order.status === "underpaid") {
    return json(
      { ...agentInvoiceView(order, now), error: "The payment was short of $19 USDC. Start again and pay the full $19." },
      402,
    );
  }

  const payload = readX402Payment(request, body);
  if (payload) {
    const settled = await settleExactEvmPayment(
      payload,
      {
        invoice_id: order.id,
        reference: order.reference,
        amount_base_units: AGENT_CHECK_AMOUNT_BASE_UNITS,
        amount_usd: AGENT_CHECK_PRICE_USD,
        sku: AGENT_CHECK_SKU,
      },
      { settler: deps.settleExactEvm },
    );
    if (!settled.ok) return json(exactEvmFailureBody(settled), 400);
    const granted = await grantAgentPay(sql, order.id, { chain: "base", txRef: settled.transaction, now });
    const current = granted ?? (await getAgentOrder(sql, order.id));
    if (!current) return json({ error: "Unknown payment." }, 404);
    const withReport = current.report_json ? current : await attachReport(sql, current, 1, deps);
    return json(agentInvoiceView(withReport, now));
  }

  const finder: MeterChainFinder =
    deps.findPayment ??
    (async (opts) => {
      const { findMatchingUsdcPayment } = await import("../solana-pay.server.ts");
      return findMatchingUsdcPayment(opts);
    });
  let match: Awaited<ReturnType<MeterChainFinder>> = { kind: "none" };
  try {
    match = await finder({
      reference: order.reference,
      recipient: lockedSolanaUsdcRecipient(),
      amountUsdc: AGENT_CHECK_PRICE_USD,
    });
  } catch {
    match = { kind: "none" };
  }

  if (match.kind === "paid" && match.amountUsdc + 1e-9 >= AGENT_CHECK_PRICE_USD) {
    const granted = await grantAgentPay(sql, order.id, { chain: "solana", txRef: match.signature, now });
    const current = granted ?? (await getAgentOrder(sql, order.id));
    if (!current) return json({ error: "Unknown payment." }, 404);
    const withReport = current.report_json ? current : await attachReport(sql, current, 1, deps);
    return json(agentInvoiceView(withReport, now));
  }

  if (match.kind === "underpaid" || (match.kind === "paid" && match.amountUsdc + 1e-9 < AGENT_CHECK_PRICE_USD)) {
    const noted = (await noteAgentUnderpaid(sql, order.id, match.signature)) ?? order;
    return json(
      { ...agentInvoiceView(noted, now), error: "The payment was short of $19 USDC. Start again and pay the full $19." },
      402,
    );
  }

  const opened = new Date(order.created_at).getTime();
  if (now.getTime() > opened + PAY_EXPIRY_MS) {
    const expired = (await expireAgentOrder(sql, order.id)) ?? order;
    return json({ ...agentInvoiceView(expired, now), error: "This payment window closed. Start again." }, 402);
  }

  return json(agentInvoiceView(order, now), 402);
}

function unrecordedOrder(target: string, now: Date): AgentOrder {
  return {
    id: `agent_${randomBytes(12).toString("hex")}`,
    target,
    target_kind: "url",
    sku: AGENT_CHECK_SKU,
    amount_usd: AGENT_CHECK_PRICE_USD,
    amount_base_units: AGENT_CHECK_AMOUNT_BASE_UNITS,
    chain: null,
    reference: randomBytes(16).toString("hex"),
    pay_to: lockedSolanaUsdcRecipient(),
    base_pay_to: lockedEvmUsdcRecipient(),
    tx_ref: null,
    status: "pending",
    paid_at: null,
    report_until: null,
    runs_used: 0,
    report_json: null,
    created_at: now.toISOString(),
  };
}

function fail(err: unknown, fallback: string): Response {
  if (err instanceof AgentCheckError || err instanceof SsrfError) {
    const status = err instanceof AgentCheckError ? err.status : 400;
    return json({ error: err.message }, status);
  }
  console.error("[agent-check]", err instanceof Error ? err.name : "error");
  return json({ error: fallback }, 500);
}

export async function handleAgentCheckRequest(
  request: Request,
  sql: ListingQuery | null,
  deps: AgentPayDeps = {},
  now = new Date(),
): Promise<Response> {
  try {
    if (request.method === "GET") return json(pricingBody());
    if (request.method !== "POST") return json({ error: "Use POST to run the free check." }, 405);
    let body: Record<string, unknown> = {};
    try {
      body = parseBody(await request.json());
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const target = parseSiteUrl(body);
    const ipHash = hashAgentIp(clientIp(request.headers));
    await assertAgentFreeRate(sql, ipHash, now);
    const report = deps.runFree ? await deps.runFree(target, sql) : await runAgentCheck(target, "free", { sql });
    return json({
      ...report,
      next: {
        hire: { line: "Hire us, we fix it with you", href: "/hire" },
        directory: { line: "List in the directory, free.", href: "/directory" },
        featured: { line: "Feature a listing for $19.", href: "/directory#featured" },
        report: { post: AGENT_CHECK_REPORT_PATH, price_usd: AGENT_CHECK_PRICE_USD, days: AGENT_CHECK_DAYS },
      },
    });
  } catch (err) {
    return fail(err, "Could not run this check.");
  }
}

export async function handleAgentReportRequest(
  request: Request,
  sql: ListingQuery | null,
  deps: AgentPayDeps = {},
  now = new Date(),
): Promise<Response> {
  try {
    if (request.method === "GET") return json(pricingBody());
    if (request.method !== "POST") return json({ error: "Use POST to start a report payment." }, 405);
    let body: Record<string, unknown> = {};
    try {
      body = parseBody(await request.json());
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!sql) {
      const target = parseSiteUrl(body);
      const order = unrecordedOrder(target, now);
      return json(
        {
          ...agentInvoiceView(order, now, false),
          error: "This database cannot record the report payment yet. Do not send USDC.",
        },
        402,
      );
    }
    const payment = readX402Payment(request, body);
    const key = invoiceKey(body, payment);
    if (key) {
      const order = await getAgentOrder(sql, key);
      if (!order) return json({ error: "Unknown payment." }, 404);
      return await watchOrder(sql, order, request, body, deps, now);
    }
    const target = parseSiteUrl(body);
    try {
      const order = await startAgentPay(sql, target, now, hashAgentIp(clientIp(request.headers)));
      return json(agentInvoiceView(order, now), 402);
    } catch (err) {
      if (!isAgentSchemaMissing(err)) throw err;
      const order = unrecordedOrder(target, now);
      return json(
        {
          ...agentInvoiceView(order, now, false),
          error: "This database cannot record the report payment yet. Do not send USDC.",
        },
        402,
      );
    }
  } catch (err) {
    if (isAgentSchemaMissing(err)) {
      return json({ error: "This database cannot record the report payment yet. Do not send USDC." }, 503);
    }
    return fail(err, "Could not start the report.");
  }
}
