import { json } from "../server/http.ts";
import { buildSolanaPayUrl } from "../solana-pay.ts";
import { publicMeterLive } from "./live.ts";
import { meter402Body, meterPricing, METER_PASS_1H } from "./pricing.ts";
import { evaluateScan, type MeterChain } from "./scan.ts";
import { evaluatePreflightSelf } from "./preflight.ts";
import {
  applyMeterHeliusPayments,
  meterFundsDestination,
  watchMeterInvoice,
  type MeterChainFinder,
} from "./settle.ts";
import {
  allowDevGrant,
  publicPassView,
  type MeterStore,
} from "./store.ts";

const CHAINS = new Set(["solana", "ethereum", "base"]);

export type MeterHttpDeps = {
  findPayment?: MeterChainFinder;
};

export function readPassToken(request: Request, body?: Record<string, unknown>) {
  const header = request.headers.get("x-agent-pass") ?? "";
  if (header.trim()) return header.trim();
  const fromBody = body?.pass_token ?? body?.passToken;
  return typeof fromBody === "string" ? fromBody.trim() : "";
}

function chainOf(value: unknown): MeterChain | null {
  const c = String(value ?? "").toLowerCase();
  return CHAINS.has(c) ? (c as MeterChain) : null;
}

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function proofRecord(body: Record<string, unknown>): Record<string, unknown> {
  const proof = body.proof;
  if (proof && typeof proof === "object" && !Array.isArray(proof)) return proof as Record<string, unknown>;
  return {};
}

export async function handleMeterRequest(
  request: Request,
  pathname: string,
  store?: MeterStore,
  deps: MeterHttpDeps = {},
): Promise<Response> {
  const resolved = store ?? (await defaultStore());
  const path = pathname.replace(/\/+$/, "");
  const suffix = path.replace(/^\/api\/v1\/meter\/?/, "");

  if (request.method === "GET" && (suffix === "pricing" || suffix === "")) {
    return json(meterPricing());
  }

  if (request.method === "GET" && suffix === "funds") {
    return json(meterFundsDestination());
  }

  if (request.method === "GET" && suffix === "live") {
    const report = await resolved.report();
    return json(publicMeterLive(report));
  }

  if (request.method === "GET" && suffix === "report") {
    return meterReport(request, resolved);
  }

  if (request.method === "GET" && suffix.startsWith("pass/")) {
    const id = suffix.slice("pass/".length);
    const pass = await resolved.getPassById(id);
    if (pass) return json(publicPassView(pass));
    const invoice = await resolved.getInvoice(id);
    if (!invoice) return json({ error: "unknown_pass" }, 404);
    return json(publicInvoiceView(invoice));
  }

  if (request.method === "GET" && suffix.startsWith("invoice/")) {
    const invoice = await resolved.getInvoice(suffix.slice("invoice/".length));
    if (!invoice) return json({ error: "unknown_invoice" }, 404);
    return json(publicInvoiceView(invoice));
  }

  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = parseBody(await request.json());
    } catch {
      body = {};
    }
  }

  if (request.method === "POST" && (suffix === "pass" || suffix === "" || suffix === "watch")) {
    return issueOrInvoice(request, body, resolved, deps);
  }

  if (request.method === "POST" && suffix === "helius") {
    const paid = await applyMeterHeliusPayments(resolved, body);
    return json({ ok: true, matched: paid.length, paid });
  }

  if (request.method === "POST" && suffix === "scan") {
    return runScan(request, body, resolved);
  }

  if (request.method === "POST" && suffix === "preflight") {
    return runPreflight(request, body, resolved);
  }

  return json({ error: "unknown_meter_route", usage: meterPricing().endpoints }, 404);
}

async function defaultStore(): Promise<MeterStore> {
  const { getDefaultMeterStore } = await import("./sql-store.ts");
  return getDefaultMeterStore();
}

function meterReport(request: Request, store: MeterStore) {
  const secret = process.env.INTERNAL_STATS_SECRET?.trim();
  if (!secret) return json({ error: "Not found" }, 404);
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cron = request.headers.get("x-vercel-cron") === "1";
  if (!cron && bearer !== secret) return json({ error: "Unauthorized" }, 401);
  return Promise.resolve(store.report()).then((report) => json(report));
}

function publicInvoiceView(invoice: Awaited<ReturnType<MeterStore["createInvoice"]>>) {
  return {
    invoice_id: invoice.invoice_id,
    status: invoice.status,
    reference: invoice.reference,
    pay_to: invoice.pay_to,
    amount_usd: invoice.amount_usd,
    amount_base_units: invoice.amount_base_units,
    chain: invoice.chain,
    asset: invoice.asset,
    signature: invoice.signature,
    pass_id: invoice.pass_id,
    expires_at: invoice.expires_at,
    pay_url: buildSolanaPayUrl({
      recipient: invoice.pay_to,
      amountUsdc: invoice.amount_usd,
      reference: invoice.reference,
      planName: "Agent Meter pass",
    }),
  };
}

async function issueOrInvoice(
  request: Request,
  body: Record<string, unknown>,
  store: MeterStore,
  deps: MeterHttpDeps,
) {
  const proof = proofRecord(body);
  const proofType = String(proof.type ?? body.proof_type ?? "").toLowerCase();

  if (proofType === "dev" && allowDevGrant()) {
    const issued = await store.issuePass({
      payer_address: typeof body.payer_address === "string" ? body.payer_address : null,
    });
    return json({
      ...publicPassView(issued.pass),
      token: issued.token,
    });
  }

  if (proofType === "helius") {
    const paid = await applyMeterHeliusPayments(store, proof.payload ?? body.payload ?? body);
    return json({ ok: true, matched: paid.length, paid });
  }

  const invoiceKey = String(
    body.invoice_id ?? body.invoiceId ?? proof.invoice_id ?? body.reference ?? proof.reference ?? "",
  ).trim();

  const wantsWatch =
    invoiceKey ||
    proofType === "solana" ||
    proofType === "chain" ||
    proofType === "signature" ||
    typeof proof.signature === "string";

  if (wantsWatch) {
    const invoice = invoiceKey ? await store.getInvoice(invoiceKey) : null;
    if (!invoice) {
      const fresh = await store.createInvoice();
      return json(meter402Body(fresh), 402);
    }
    const finder: MeterChainFinder =
      deps.findPayment ??
      (async (opts) => {
        const { findMatchingUsdcPayment } = await import("../solana-pay.server.ts");
        return findMatchingUsdcPayment(opts);
      });
    const watched = await watchMeterInvoice(store, invoice, finder);
    if (watched.token) {
      const pass = await store.getPassById(watched.invoice.pass_id ?? "");
      return json({
        ...(pass ? publicPassView(pass) : {}),
        token: watched.token,
        invoice_id: watched.invoice.invoice_id,
        signature: watched.invoice.signature,
      });
    }
    return json(
      {
        ...meter402Body(watched.invoice),
        status: watched.invoice.status,
        signature: watched.invoice.signature,
      },
      402,
    );
  }

  const invoice = await store.createInvoice();
  return json(meter402Body(invoice), 402);
}

async function requirePass(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const token = readPassToken(request, body);
  const pass = await store.getPassByToken(token);
  if (!pass) {
    const invoice = await store.createInvoice();
    return { pass: null as null, token, response: json(meter402Body(invoice), 402) };
  }
  return { pass, token, response: null as Response | null };
}

async function runScan(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const gate = await requirePass(request, body, store);
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain);
  const address = String(body.address ?? "").trim();
  if (!chain || !address) return json({ error: "Provide chain and address." }, 400);

  const scanned = evaluateScan({ address, chain });
  const after = await store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const invoice = await store.createInvoice();
    return json(meter402Body(invoice), 402);
  }
  await store.logCall({
    pass_id: after.id,
    kind: "scan",
    chain,
    wallet: typeof body.from === "string" ? body.from : null,
    address,
    value_usd: null,
    decision: scanned.risk,
  });
  return json({
    ...scanned,
    pass_remaining_calls: after.included_calls - after.used_calls,
    pass_expires_at: after.expires_at,
  });
}

async function runPreflight(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const gate = await requirePass(request, body, store);
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain);
  const wallet = String(body.wallet ?? "").trim();
  const to = String(body.to ?? "").trim();
  const value_usd = Number(body.value_usd ?? body.valueUsd);
  const cap_usd = Number(body.cap_usd ?? body.capUsd);
  if (!chain || !wallet || !to) return json({ error: "Provide chain, wallet, and to." }, 400);

  const declaredSpend = Number(body.spent_usd ?? body.spentUsd);
  const logged = await store.spentTodayUsd(wallet);
  const spent_today_usd = Number.isFinite(declaredSpend) ? Math.max(declaredSpend, logged) : logged;
  const verdict = evaluatePreflightSelf({ cap_usd, value_usd, spent_today_usd });

  const after = await store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const invoice = await store.createInvoice();
    return json(meter402Body(invoice), 402);
  }
  if (verdict.decision === "allow") await store.addAllowSpend(wallet, value_usd);
  await store.logCall({
    pass_id: after.id,
    kind: "preflight",
    chain,
    wallet,
    address: to,
    value_usd,
    decision: verdict.decision,
  });
  return json({
    ...verdict,
    to,
    pass_remaining_calls: after.included_calls - after.used_calls,
    pass_expires_at: after.expires_at,
  });
}

export function meterPassRemaining(pass: { included_calls: number; used_calls: number; expires_at: string }) {
  return {
    pass_remaining_calls: Math.max(0, pass.included_calls - pass.used_calls),
    pass_expires_at: pass.expires_at,
    covers: METER_PASS_1H.covers,
  };
}
