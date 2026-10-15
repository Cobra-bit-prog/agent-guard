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
import {
  PAY_EXPIRY_MS,
  SOLANA_PAYOUT_ADDRESS,
  USDC_MINT,
  buildSolanaPayUrl,
  lockedSolanaUsdcRecipient,
} from "../solana-pay.ts";
import { json } from "../server/http.ts";
import { shipPackage } from "../ship/packages.ts";
import {
  X402_CHECK_DAYS,
  X402_CHECK_HONESTY,
  X402_CHECK_LINE,
  X402_CHECK_PAY_LINE,
  X402_CHECK_PRICE_USD,
  X402_CHECK_REPORT_PATH,
  X402_CHECK_RUNS,
  X402_CHECK_SKU,
} from "./copy.ts";
import {
  expireX402Order,
  getX402Order,
  grantX402Pay,
  hashCheckIp,
  isX402SchemaMissing,
  noteX402Underpaid,
  parseCheckTarget,
  recheckOpen,
  saveX402Report,
  startX402Pay,
  assertFreeRate,
  X402_CHECK_AMOUNT_BASE_UNITS,
  X402CheckError,
  type X402Order,
} from "./pay.ts";
import { runListingCheck, type CheckTarget, type X402Report } from "./run.ts";
import { SsrfError } from "./ssrf.ts";

export type X402PayDeps = {
  findPayment?: MeterChainFinder;
  settleExactEvm?: ExactEvmSettler;
  runFree?: (target: CheckTarget, sql: ListingQuery | null) => Promise<X402Report>;
  runReport?: (target: CheckTarget, sql: ListingQuery | null) => Promise<X402Report>;
};

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function acceptsFor(order: X402Order): MeterExactAccept[] {
  const extra = {
    sku: X402_CHECK_SKU,
    price_usd: X402_CHECK_PRICE_USD,
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

function rechecksLeft(order: X402Order, now: Date): number {
  if (order.status !== "paid" || !order.report_until) return 0;
  if (new Date(order.report_until).getTime() <= now.getTime()) return 0;
  return Math.max(0, X402_CHECK_RUNS - order.runs_used);
}

export function x402InvoiceView(order: X402Order, now: Date, recorded = true) {
  let report: X402Report | null = null;
  if (order.report_json) {
    try {
      report = JSON.parse(order.report_json) as X402Report;
    } catch {
      report = null;
    }
  }
  return {
    invoice_id: order.id,
    target: order.target,
    target_kind: order.target_kind,
    sku: X402_CHECK_SKU,
    price_usd: X402_CHECK_PRICE_USD,
    days: X402_CHECK_DAYS,
    amount_usd: X402_CHECK_PRICE_USD,
    amount_base_units: X402_CHECK_AMOUNT_BASE_UNITS,
    asset: "usdc" as const,
    status: order.status,
    reference: order.reference,
    pay_to: lockedSolanaUsdcRecipient(),
    base_pay_to: lockedEvmUsdcRecipient(),
    pay_url: buildSolanaPayUrl({ amountUsdc: X402_CHECK_PRICE_USD, reference: order.reference }),
    accepts: acceptsFor(order),
    tx_ref: order.tx_ref,
    paid_at: order.paid_at,
    report_until: order.report_until,
    runs_used: order.runs_used,
    rechecks_left: rechecksLeft(order, now),
    recorded,
    line: X402_CHECK_LINE,
    note: X402_CHECK_HONESTY,
    pay: X402_CHECK_PAY_LINE,
    watch_url: `https://agent-control.net${X402_CHECK_REPORT_PATH}`,
    ...(report ? { report } : {}),
  };
}

function pricingBody() {
  return {
    sku: X402_CHECK_SKU,
    price_usd: X402_CHECK_PRICE_USD,
    days: X402_CHECK_DAYS,
    amount_base_units: X402_CHECK_AMOUNT_BASE_UNITS,
    asset: "usdc" as const,
    pay_to: SOLANA_PAYOUT_ADDRESS,
    base_pay_to: lockedEvmUsdcRecipient(),
    chains: ["base", "solana"] as const,
    line: X402_CHECK_LINE,
    note: X402_CHECK_HONESTY,
    pay: X402_CHECK_PAY_LINE,
    endpoint: `POST ${X402_CHECK_REPORT_PATH}`,
    free: `POST ${X402_CHECK_REPORT_PATH.replace(/\/report$/, "")}`,
  };
}

function targetFromOrder(order: X402Order): CheckTarget {
  return order.target_kind === "url"
    ? { url: order.target, payTo: null }
    : { url: null, payTo: order.target };
}

function invoiceKey(
  body: Record<string, unknown>,
  payment: Record<string, unknown> | null,
): string {
  const fromPayment = payment ? invoiceIdFromPayment(payment) || referenceFromPayment(payment) : "";
  const fromBody = String(body.invoice_id ?? body.invoiceId ?? body.reference ?? "").trim();
  return (fromPayment || fromBody).slice(0, 120);
}

async function attachReport(
  sql: ListingQuery,
  order: X402Order,
  runsUsed: number,
  deps: X402PayDeps,
): Promise<X402Order> {
  const runner = deps.runReport ?? ((target, db) => runListingCheck(target, "full", { sql: db }));
  const report = await runner(targetFromOrder(order), sql);
  const saved = await saveX402Report(sql, order.id, JSON.stringify(report), runsUsed);
  return saved ?? { ...order, report_json: JSON.stringify(report), runs_used: runsUsed };
}

async function watchOrder(
  sql: ListingQuery,
  order: X402Order,
  request: Request,
  body: Record<string, unknown>,
  deps: X402PayDeps,
  now: Date,
): Promise<Response> {
  const wantsRecheck = body.recheck === true;
  if (order.status === "paid") {
    if (wantsRecheck) {
      if (!recheckOpen(order, now) || order.runs_used < 1) {
        return json(
          {
            ...x402InvoiceView(order, now),
            error:
              order.runs_used >= X402_CHECK_RUNS
                ? "The free re-check was already used."
                : "The 7 days are over. Start a new report.",
          },
          402,
        );
      }
      const updated = await attachReport(sql, order, order.runs_used + 1, deps);
      return json(x402InvoiceView(updated, now));
    }
    if (order.runs_used === 0 || !order.report_json) {
      const updated = await attachReport(sql, order, 1, deps);
      return json(x402InvoiceView(updated, now));
    }
    return json(x402InvoiceView(order, now));
  }
  if (order.status === "expired") {
    return json(
      { ...x402InvoiceView(order, now), error: "This payment window closed. Start again." },
      402,
    );
  }
  if (order.status === "underpaid") {
    return json(
      {
        ...x402InvoiceView(order, now),
        error: "The payment was short of $19 USDC. Start again and pay the full $19.",
      },
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
        amount_base_units: X402_CHECK_AMOUNT_BASE_UNITS,
        amount_usd: X402_CHECK_PRICE_USD,
        sku: X402_CHECK_SKU,
      },
      { settler: deps.settleExactEvm },
    );
    if (!settled.ok) return json(exactEvmFailureBody(settled), 400);
    const granted = await grantX402Pay(sql, order.id, {
      chain: "base",
      txRef: settled.transaction,
      now,
    });
    const current = granted ?? (await getX402Order(sql, order.id));
    if (!current) return json({ error: "Unknown payment." }, 404);
    const withReport = current.report_json ? current : await attachReport(sql, current, 1, deps);
    return json(x402InvoiceView(withReport, now));
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
      amountUsdc: X402_CHECK_PRICE_USD,
    });
  } catch {
    match = { kind: "none" };
  }

  if (match.kind === "paid" && match.amountUsdc + 1e-9 >= X402_CHECK_PRICE_USD) {
    const granted = await grantX402Pay(sql, order.id, {
      chain: "solana",
      txRef: match.signature,
      now,
    });
    const current = granted ?? (await getX402Order(sql, order.id));
    if (!current) return json({ error: "Unknown payment." }, 404);
    const withReport = current.report_json ? current : await attachReport(sql, current, 1, deps);
    return json(x402InvoiceView(withReport, now));
  }

  if (
    match.kind === "underpaid" ||
    (match.kind === "paid" && match.amountUsdc + 1e-9 < X402_CHECK_PRICE_USD)
  ) {
    const noted = (await noteX402Underpaid(sql, order.id, match.signature)) ?? order;
    return json(
      {
        ...x402InvoiceView(noted, now),
        error: "The payment was short of $19 USDC. Start again and pay the full $19.",
      },
      402,
    );
  }

  const opened = new Date(order.created_at).getTime();
  if (now.getTime() > opened + PAY_EXPIRY_MS) {
    const expired = (await expireX402Order(sql, order.id)) ?? order;
    return json(
      { ...x402InvoiceView(expired, now), error: "This payment window closed. Start again." },
      402,
    );
  }

  return json(x402InvoiceView(order, now), 402);
}

function unrecordedOrder(target: { kind: "url" | "wallet"; value: string }, now: Date): X402Order {
  return {
    id: `x402_${randomBytes(12).toString("hex")}`,
    target: target.value,
    target_kind: target.kind,
    sku: X402_CHECK_SKU,
    amount_usd: X402_CHECK_PRICE_USD,
    amount_base_units: X402_CHECK_AMOUNT_BASE_UNITS,
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
  if (err instanceof X402CheckError || err instanceof SsrfError) {
    const status = err instanceof X402CheckError ? err.status : 400;
    return json({ error: err.message }, status);
  }
  console.error("[x402-check]", err instanceof Error ? err.name : "error");
  return json({ error: fallback }, 500);
}

export async function handleX402CheckRequest(
  request: Request,
  sql: ListingQuery | null,
  deps: X402PayDeps = {},
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
    const target = parseCheckTarget(body);
    const ipHash = hashCheckIp(clientIp(request.headers));
    await assertFreeRate(sql, ipHash, now);
    const checkTarget: CheckTarget =
      target.kind === "url"
        ? { url: target.value, payTo: null }
        : { url: null, payTo: target.value };
    const report = deps.runFree
      ? await deps.runFree(checkTarget, sql)
      : await runListingCheck(checkTarget, "free", { sql });
    return json({
      ...report,
      listing: report.listing ?? null,
      next: {
        hire: { line: "Hire us, we fix it with you", href: "/hire" },
        directory: { line: "List in the directory, free.", href: "/directory" },
        featured: { line: "Feature a listing for $19.", href: "/directory#featured" },
        report: {
          post: X402_CHECK_REPORT_PATH,
          price_usd: X402_CHECK_PRICE_USD,
          days: X402_CHECK_DAYS,
        },
        ...(report.failed > 0 ||
        report.checks.some((check) => check.id === "header_size" && check.status === "warn")
          ? {
              ship: {
                line: "Ship to paid",
                href: "/ship",
                fix_usd: shipPackage("fix")?.priceUsd,
                launch_usd: shipPackage("launch")?.priceUsd,
                keep_usd: shipPackage("keep")?.priceUsd,
              },
            }
          : {}),
      },
    });
  } catch (err) {
    return fail(err, "Could not run this check.");
  }
}

export async function handleX402ReportRequest(
  request: Request,
  sql: ListingQuery | null,
  deps: X402PayDeps = {},
  now = new Date(),
): Promise<Response> {
  try {
    if (request.method === "GET") return json(pricingBody());
    if (request.method !== "POST")
      return json({ error: "Use POST to start a report payment." }, 405);
    let body: Record<string, unknown> = {};
    try {
      body = parseBody(await request.json());
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!sql) {
      const target = parseCheckTarget(body);
      const order = unrecordedOrder(target, now);
      return json(
        {
          ...x402InvoiceView(order, now, false),
          error: "This database cannot record the report payment yet. Do not send USDC.",
        },
        402,
      );
    }
    const payment = readX402Payment(request, body);
    const key = invoiceKey(body, payment);
    if (key) {
      const order = await getX402Order(sql, key);
      if (!order) return json({ error: "Unknown payment." }, 404);
      return await watchOrder(sql, order, request, body, deps, now);
    }
    const target = parseCheckTarget(body);
    try {
      const order = await startX402Pay(sql, target, now, hashCheckIp(clientIp(request.headers)));
      return json(x402InvoiceView(order, now), 402);
    } catch (err) {
      if (!isX402SchemaMissing(err)) throw err;
      const order = unrecordedOrder(target, now);
      return json(
        {
          ...x402InvoiceView(order, now, false),
          error: "This database cannot record the report payment yet. Do not send USDC.",
        },
        402,
      );
    }
  } catch (err) {
    if (isX402SchemaMissing(err)) {
      return json(
        { error: "This database cannot record the report payment yet. Do not send USDC." },
        503,
      );
    }
    return fail(err, "Could not start the report.");
  }
}
