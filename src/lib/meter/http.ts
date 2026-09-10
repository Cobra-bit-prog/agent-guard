import { json } from "../server/http.ts";
import { buildSolanaPayUrl } from "../solana-pay.ts";
import {
  coversForSku,
  meter402Body,
  meterPricing,
  resolveMeterSku,
  skuCovers,
  type MeterSku,
} from "./pricing.ts";
import { evaluateScan, type MeterChain } from "./scan.ts";
import { evaluatePreflightSelf } from "./preflight.ts";
import {
  applyMeterHeliusPayments,
  meterFundsDestination,
  watchMeterInvoice,
  type MeterChainFinder,
} from "./settle.ts";
import { publicStampView, signStamp, type StampDecision, type StampPayload } from "./stamp.ts";
import {
  allowDevGrant,
  newMeterId,
  publicPassView,
  type MeterPass,
  type MeterStore,
} from "./store.ts";

const CHAINS = new Set(["solana", "ethereum", "base"]);
const SCAN_BATCH_MAX = 100;

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

function skuFromBody(body: Record<string, unknown>): MeterSku | { error: "unknown_sku"; sku: string } {
  return resolveMeterSku(body.sku);
}

function unknownSkuResponse(sku: string): Response {
  return json({ error: "unknown_sku", sku }, 400);
}

async function invoiceForBody(
  store: MeterStore,
  body: Record<string, unknown>,
): Promise<{ ok: true; invoice: Awaited<ReturnType<MeterStore["createInvoice"]>> } | { ok: false; response: Response }> {
  const sku = skuFromBody(body);
  if ("error" in sku) return { ok: false, response: unknownSkuResponse(sku.sku) };
  return { ok: true, invoice: await store.createInvoice({ sku: sku.id }) };
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

  if (request.method === "GET" && suffix.startsWith("stamp/")) {
    return getStamp(resolved, suffix.slice("stamp/".length));
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

  if (request.method === "POST" && (suffix === "scan-batch" || suffix === "scan_batch")) {
    return runScanBatch(request, body, resolved);
  }

  if (request.method === "POST" && suffix === "stamp") {
    return runStamp(request, body, resolved);
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
    sku: invoice.sku,
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
): Promise<Response> {
  const proof = proofRecord(body);
  const proofType = String(proof.type ?? body.proof_type ?? "").toLowerCase();

  if (proofType === "dev" && allowDevGrant()) {
    const sku = skuFromBody(body);
    if ("error" in sku) return unknownSkuResponse(sku.sku);
    const issued = await store.issuePass({
      sku: sku.id,
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
      const minted = await invoiceForBody(store, body);
      if (!minted.ok) return minted.response;
      return json(meter402Body(minted.invoice), 402);
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

  const minted = await invoiceForBody(store, body);
  if (!minted.ok) return minted.response;
  return json(meter402Body(minted.invoice), 402);
}

function skuDoesNotCoverResponse(pass: MeterPass, kind: string) {
  return json(
    {
      error: "sku_does_not_cover",
      sku: pass.sku,
      kind,
      covers: coversForSku(pass.sku),
    },
    402,
  );
}

async function requirePass(
  request: Request,
  body: Record<string, unknown>,
  store: MeterStore,
  kind?: string,
) {
  const token = readPassToken(request, body);
  const pass = await store.getPassByToken(token);
  if (!pass) {
    const minted = await invoiceForBody(store, body);
    if (!minted.ok) return { pass: null as null, token, response: minted.response };
    return { pass: null as null, token, response: json(meter402Body(minted.invoice), 402) };
  }
  if (kind && !skuCovers(pass.sku, kind)) {
    return { pass, token, response: skuDoesNotCoverResponse(pass, kind) };
  }
  return { pass, token, response: null as Response | null };
}

async function runScan(request: Request, body: Record<string, unknown>, store: MeterStore): Promise<Response> {
  const gate = await requirePass(request, body, store, "scan");
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain);
  const address = String(body.address ?? "").trim();
  if (!chain || !address) return json({ error: "Provide chain and address." }, 400);

  const scanned = evaluateScan({ address, chain });
  const after = await store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const minted = await invoiceForBody(store, body);
    if (!minted.ok) return minted.response;
    return json(meter402Body(minted.invoice), 402);
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
    ...meterPassRemaining(after),
  });
}

async function runPreflight(request: Request, body: Record<string, unknown>, store: MeterStore): Promise<Response> {
  const gate = await requirePass(request, body, store, "preflight");
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
    const minted = await invoiceForBody(store, body);
    if (!minted.ok) return minted.response;
    return json(meter402Body(minted.invoice), 402);
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
    ...meterPassRemaining(after),
  });
}

function parseAddressList(body: Record<string, unknown>): string[] | { error: string; max?: number } {
  const raw = body.addresses ?? body.address;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const addresses = list.map((row) => String(row ?? "").trim()).filter(Boolean);
  if (!addresses.length) return { error: "Provide addresses[] (max 100)." };
  if (addresses.length > SCAN_BATCH_MAX) return { error: "too_many_addresses", max: SCAN_BATCH_MAX };
  return addresses;
}

async function runScanBatch(request: Request, body: Record<string, unknown>, store: MeterStore): Promise<Response> {
  const gate = await requirePass(request, body, store, "scan_batch");
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain);
  if (!chain) return json({ error: "Provide chain and addresses[]." }, 400);
  const parsed = parseAddressList(body);
  if (!Array.isArray(parsed)) {
    return json(parsed.max ? { error: parsed.error, max: parsed.max } : { error: parsed.error }, 400);
  }

  const results = parsed.map((address) => evaluateScan({ address, chain }));
  const after = await store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const minted = await invoiceForBody(store, body);
    if (!minted.ok) return minted.response;
    return json(meter402Body(minted.invoice), 402);
  }
  const worst = results.reduce(
    (acc, row) => (riskRank(row.risk) > riskRank(acc) ? row.risk : acc),
    "ok" as ReturnType<typeof evaluateScan>["risk"],
  );
  await store.logCall({
    pass_id: after.id,
    kind: "scan_batch",
    chain,
    wallet: typeof body.from === "string" ? body.from : null,
    address: parsed[0] ?? null,
    value_usd: null,
    decision: worst,
  });
  return json({
    count: results.length,
    risk: worst,
    results,
    ...meterPassRemaining(after),
  });
}

function riskRank(risk: ReturnType<typeof evaluateScan>["risk"]): number {
  if (risk === "sink") return 3;
  if (risk === "warn") return 2;
  if (risk === "new") return 1;
  return 0;
}

function stampDecisionOf(body: Record<string, unknown>): StampDecision | null {
  const raw = String(body.decision ?? "").toLowerCase();
  if (raw === "allow" || raw === "stop") return raw;
  const value_usd = Number(body.value_usd ?? body.valueUsd);
  const cap_usd = Number(body.cap_usd ?? body.capUsd);
  if (Number.isFinite(value_usd) && Number.isFinite(cap_usd)) {
    return evaluatePreflightSelf({ cap_usd, value_usd, spent_today_usd: 0 }).decision;
  }
  return null;
}

async function runStamp(request: Request, body: Record<string, unknown>, store: MeterStore): Promise<Response> {
  const gate = await requirePass(request, body, store, "stamp");
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain) ?? "solana";
  const decision = stampDecisionOf(body);
  if (!decision) return json({ error: "Provide decision allow|stop, or value_usd and cap_usd." }, 400);

  const after = await store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const minted = await invoiceForBody(store, body);
    if (!minted.ok) return minted.response;
    return json(meter402Body(minted.invoice), 402);
  }

  const created_at = new Date().toISOString();
  const payload: StampPayload = {
    stamp_id: newMeterId("stamp"),
    decision,
    chain,
    wallet: typeof body.wallet === "string" ? body.wallet.trim() || null : null,
    address: String(body.to ?? body.address ?? "").trim() || null,
    value_usd: Number.isFinite(Number(body.value_usd ?? body.valueUsd))
      ? Number(body.value_usd ?? body.valueUsd)
      : null,
    pass_id: after.id,
    created_at,
  };
  const hmac = signStamp(payload);
  await store.saveStamp({
    id: payload.stamp_id,
    pass_id: payload.pass_id,
    decision: payload.decision,
    chain: payload.chain,
    wallet: payload.wallet,
    address: payload.address,
    value_usd: payload.value_usd,
    hmac,
    created_at,
  });
  await store.logCall({
    pass_id: after.id,
    kind: "stamp",
    chain,
    wallet: payload.wallet,
    address: payload.address,
    value_usd: payload.value_usd,
    decision,
  });
  return json({
    ...publicStampView(payload, hmac),
    ...meterPassRemaining(after),
  });
}

async function getStamp(store: MeterStore, rawId: string): Promise<Response> {
  const id = rawId.trim();
  if (!id) return json({ error: "unknown_stamp" }, 404);
  const row = await store.getStamp(id);
  if (!row) return json({ error: "unknown_stamp" }, 404);
  return json(
    publicStampView(
      {
        stamp_id: row.id,
        decision: row.decision,
        chain: row.chain,
        wallet: row.wallet,
        address: row.address,
        value_usd: row.value_usd,
        pass_id: row.pass_id,
        created_at: row.created_at,
      },
      row.hmac,
    ),
  );
}

export function meterPassRemaining(pass: { sku?: string; included_calls: number; used_calls: number; expires_at: string }) {
  return {
    pass_remaining_calls: Math.max(0, pass.included_calls - pass.used_calls),
    pass_expires_at: pass.expires_at,
    covers: coversForSku(pass.sku ?? "pass_1h"),
  };
}
