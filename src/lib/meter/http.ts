import { json } from "../server/http.ts";
import { meter402Body, meterPricing, METER_PASS_1H } from "./pricing.ts";
import { evaluateScan, type MeterChain } from "./scan.ts";
import { evaluatePreflightSelf } from "./preflight.ts";
import {
  allowDevGrant,
  getMemoryMeterStore,
  publicPassView,
  type MeterStore,
} from "./store.ts";

const CHAINS = new Set(["solana", "ethereum", "base"]);

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

export async function handleMeterRequest(
  request: Request,
  pathname: string,
  store: MeterStore = getMemoryMeterStore(),
): Promise<Response> {
  const path = pathname.replace(/\/+$/, "");
  const suffix = path.replace(/^\/api\/v1\/meter\/?/, "");

  if (request.method === "GET" && (suffix === "pricing" || suffix === "")) {
    return json(meterPricing());
  }

  if (request.method === "GET" && suffix.startsWith("pass/")) {
    const id = suffix.slice("pass/".length);
    const pass = store.getPassById(id);
    if (!pass) return json({ error: "unknown_pass" }, 404);
    return json(publicPassView(pass));
  }

  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = parseBody(await request.json());
    } catch {
      body = {};
    }
  }

  if (request.method === "POST" && (suffix === "pass" || suffix === "")) {
    return issueOrInvoice(request, body, store);
  }

  if (request.method === "POST" && suffix === "scan") {
    return runScan(request, body, store);
  }

  if (request.method === "POST" && suffix === "preflight") {
    return runPreflight(request, body, store);
  }

  return json({ error: "unknown_meter_route", usage: meterPricing().endpoints }, 404);
}

function issueOrInvoice(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const proof = body.proof;
  const proofType =
    proof && typeof proof === "object" && "type" in proof ? String((proof as { type: unknown }).type) : "";

  if (proofType === "dev" && allowDevGrant()) {
    const issued = store.issuePass({
      payer_address: typeof body.payer_address === "string" ? body.payer_address : null,
    });
    return json({
      ...publicPassView(issued.pass),
      token: issued.token,
    });
  }

  const invoice = store.createInvoice();
  return json(meter402Body(invoice), 402);
}

function requirePass(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const token = readPassToken(request, body);
  const pass = store.getPassByToken(token);
  if (!pass) {
    const invoice = store.createInvoice();
    return { pass: null as null, token, response: json(meter402Body(invoice), 402) };
  }
  return { pass, token, response: null as Response | null };
}

function runScan(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const gate = requirePass(request, body, store);
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain);
  const address = String(body.address ?? "").trim();
  if (!chain || !address) return json({ error: "Provide chain and address." }, 400);

  const scanned = evaluateScan({ address, chain });
  const after = store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const invoice = store.createInvoice();
    return json(meter402Body(invoice), 402);
  }
  store.logCall({
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

function runPreflight(request: Request, body: Record<string, unknown>, store: MeterStore) {
  const gate = requirePass(request, body, store);
  if (gate.response) return gate.response;
  const chain = chainOf(body.chain);
  const wallet = String(body.wallet ?? "").trim();
  const to = String(body.to ?? "").trim();
  const value_usd = Number(body.value_usd ?? body.valueUsd);
  const cap_usd = Number(body.cap_usd ?? body.capUsd);
  if (!chain || !wallet || !to) return json({ error: "Provide chain, wallet, and to." }, 400);

  const declaredSpend = Number(body.spent_usd ?? body.spentUsd);
  const logged = store.spentTodayUsd(wallet);
  const spent_today_usd = Number.isFinite(declaredSpend) ? Math.max(declaredSpend, logged) : logged;
  const verdict = evaluatePreflightSelf({ cap_usd, value_usd, spent_today_usd });

  const after = store.consumeCall(gate.pass!);
  if (after === "exhausted") {
    const invoice = store.createInvoice();
    return json(meter402Body(invoice), 402);
  }
  if (verdict.decision === "allow") store.addAllowSpend(wallet, value_usd);
  store.logCall({
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
