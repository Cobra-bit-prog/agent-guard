import { createHash, randomBytes } from "node:crypto";
import { SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import { METER_PASS_1H, METER_PASS_SKU } from "./pricing.ts";
import { utcDayKey } from "./preflight.ts";

export type MeterPass = {
  id: string;
  token_hash: string;
  sku: string;
  chain: string;
  created_at: string;
  expires_at: string;
  included_calls: number;
  used_calls: number;
  payer_address: string | null;
};

export type MeterCallLog = {
  id: string;
  pass_id: string;
  kind: "scan" | "preflight";
  chain: string;
  wallet: string | null;
  address: string | null;
  value_usd: number | null;
  decision: string | null;
  created_at: string;
};

export type MeterInvoice = {
  invoice_id: string;
  reference: string;
  sku: string;
  pay_to: string;
  amount_usd: number;
  amount_base_units: string;
  chain: string;
  asset: string;
  created_at: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function allowDevGrant(env = process.env): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.METER_DEV_GRANT === "1";
}

export type MeterStore = {
  createInvoice(): MeterInvoice;
  issuePass(input?: { payer_address?: string | null; nowMs?: number }): { pass: MeterPass; token: string };
  getPassByToken(token: string, nowMs?: number): MeterPass | null;
  getPassById(id: string): MeterPass | null;
  consumeCall(pass: MeterPass): MeterPass | "exhausted";
  logCall(row: Omit<MeterCallLog, "id" | "created_at">): void;
  spentTodayUsd(wallet: string, nowMs?: number): number;
  addAllowSpend(wallet: string, valueUsd: number, nowMs?: number): void;
  pendingApprovalsCreated: number;
};

export function createMeterStore(): MeterStore {
  const passes = new Map<string, MeterPass>();
  const byHash = new Map<string, string>();
  const logs: MeterCallLog[] = [];
  const spend = new Map<string, number>();

  function spendKey(wallet: string, nowMs: number) {
    return `${wallet.trim().toLowerCase()}:${utcDayKey(nowMs)}`;
  }

  return {
    pendingApprovalsCreated: 0,
    createInvoice() {
      return {
        invoice_id: id("inv"),
        reference: id("ref"),
        sku: METER_PASS_SKU,
        pay_to: SOLANA_PAYOUT_ADDRESS,
        amount_usd: METER_PASS_1H.price_usd,
        amount_base_units: METER_PASS_1H.amount_base_units,
        chain: METER_PASS_1H.chain,
        asset: METER_PASS_1H.asset,
        created_at: new Date().toISOString(),
      };
    },
    issuePass(input = {}) {
      const now = input.nowMs ?? Date.now();
      const token = `acp_${randomBytes(18).toString("base64url")}`;
      const pass: MeterPass = {
        id: id("pass"),
        token_hash: hashToken(token),
        sku: METER_PASS_SKU,
        chain: METER_PASS_1H.chain,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + METER_PASS_1H.duration_sec * 1000).toISOString(),
        included_calls: METER_PASS_1H.included_calls,
        used_calls: 0,
        payer_address: input.payer_address ?? null,
      };
      passes.set(pass.id, pass);
      byHash.set(pass.token_hash, pass.id);
      return { pass, token };
    },
    getPassByToken(token, nowMs = Date.now()) {
      const raw = token.trim();
      if (!raw) return null;
      const pid = byHash.get(hashToken(raw));
      if (!pid) return null;
      const pass = passes.get(pid);
      if (!pass) return null;
      if (Date.parse(pass.expires_at) <= nowMs) return null;
      if (pass.used_calls >= pass.included_calls) return null;
      return pass;
    },
    getPassById(passId) {
      return passes.get(passId) ?? null;
    },
    consumeCall(pass) {
      if (pass.used_calls >= pass.included_calls) return "exhausted";
      const next = { ...pass, used_calls: pass.used_calls + 1 };
      passes.set(pass.id, next);
      return next;
    },
    logCall(row) {
      logs.push({
        ...row,
        id: id("mlog"),
        created_at: new Date().toISOString(),
      });
    },
    spentTodayUsd(wallet, nowMs = Date.now()) {
      return spend.get(spendKey(wallet, nowMs)) ?? 0;
    },
    addAllowSpend(wallet, valueUsd, nowMs = Date.now()) {
      const key = spendKey(wallet, nowMs);
      spend.set(key, (spend.get(key) ?? 0) + valueUsd);
    },
  };
}

/** Process-local store for preview / tests. Production deploy should swap for SQL. */
const globalRef = globalThis as typeof globalThis & { __agentMeterStore__?: MeterStore };
export function getMemoryMeterStore(): MeterStore {
  if (!globalRef.__agentMeterStore__) globalRef.__agentMeterStore__ = createMeterStore();
  return globalRef.__agentMeterStore__;
}

export function publicPassView(pass: MeterPass) {
  return {
    pass_id: pass.id,
    sku: pass.sku,
    expires_at: pass.expires_at,
    included_calls: pass.included_calls,
    remaining_calls: Math.max(0, pass.included_calls - pass.used_calls),
    covers: [...METER_PASS_1H.covers],
  };
}
