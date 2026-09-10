import { createHash, randomBytes } from "node:crypto";
import { newPayReference } from "../pay-invoice.ts";
import { PAY_EXPIRY_MS, SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import { coversForSku, meterSkuOrDefault, METER_PASS_1H, METER_PASS_SKU, type MeterSku } from "./pricing.ts";
import { utcDayKey } from "./preflight.ts";
import type { StampDecision } from "./stamp.ts";

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
  invoice_id: string | null;
  signature: string | null;
  paid_amount_usd: number | null;
};

export type MeterCallKind = "scan" | "preflight" | "scan_batch" | "stamp";

export type MeterCallLog = {
  id: string;
  pass_id: string;
  kind: MeterCallKind;
  chain: string;
  wallet: string | null;
  address: string | null;
  value_usd: number | null;
  decision: string | null;
  created_at: string;
};

export type MeterStamp = {
  id: string;
  pass_id: string;
  decision: StampDecision;
  chain: string;
  wallet: string | null;
  address: string | null;
  value_usd: number | null;
  hmac: string;
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
  status: "pending" | "paid" | "expired" | "underpaid";
  signature: string | null;
  paid_amount_usd: number | null;
  payer_address: string | null;
  pass_id: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
};

export type MeterPaymentRow = {
  invoice_id: string;
  pass_id: string | null;
  signature: string;
  amount_usd: number;
  payer_address: string | null;
  paid_at: string;
};

export type MeterReport = {
  product: "Agent Meter";
  funds: {
    pay_to: string;
    chain: "solana";
    asset: "usdc";
  };
  invoices_created: number;
  invoices_paid: number;
  invoices_pending: number;
  passes_issued: number;
  agents_paid: number;
  usdc_received: number;
  usdc_pending: number;
  calls: number;
  recent_payments: MeterPaymentRow[];
  generated_at: string;
};

export type Awaitable<T> = T | Promise<T>;

export type IssuePassInput = {
  sku?: string;
  payer_address?: string | null;
  nowMs?: number;
  invoice_id?: string | null;
  signature?: string | null;
  paid_amount_usd?: number | null;
};

export type CreateInvoiceInput = {
  sku?: string;
  nowMs?: number;
};

export type MeterStore = {
  createInvoice(opts?: CreateInvoiceInput): Awaitable<MeterInvoice>;
  getInvoice(idOrRef: string): Awaitable<MeterInvoice | null>;
  noteUnderpaid(invoiceId: string, signature: string, amountUsd: number): Awaitable<MeterInvoice | null>;
  fulfillInvoice(
    invoiceId: string,
    match: { signature: string; amountUsdc: number; payer_address?: string | null },
  ): Awaitable<{ invoice: MeterInvoice; pass: MeterPass; token: string }>;
  issuePass(input?: IssuePassInput): Awaitable<{ pass: MeterPass; token: string }>;
  getPassByToken(token: string, nowMs?: number): Awaitable<MeterPass | null>;
  getPassById(id: string): Awaitable<MeterPass | null>;
  consumeCall(pass: MeterPass): Awaitable<MeterPass | "exhausted">;
  logCall(row: Omit<MeterCallLog, "id" | "created_at">): Awaitable<void>;
  spentTodayUsd(wallet: string, nowMs?: number): Awaitable<number>;
  addAllowSpend(wallet: string, valueUsd: number, nowMs?: number): Awaitable<void>;
  saveStamp(row: MeterStamp): Awaitable<MeterStamp>;
  getStamp(id: string): Awaitable<MeterStamp | null>;
  report(): Awaitable<MeterReport>;
  pendingApprovalsCreated: number;
};

export function newMeterId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function invoiceDraft(opts: CreateInvoiceInput = {}): MeterInvoice {
  const nowMs = opts.nowMs ?? Date.now();
  const sku: MeterSku = meterSkuOrDefault(opts.sku);
  return {
    invoice_id: newMeterId("inv"),
    reference: newPayReference(),
    sku: sku.id,
    pay_to: SOLANA_PAYOUT_ADDRESS,
    amount_usd: sku.price_usd,
    amount_base_units: sku.amount_base_units,
    chain: sku.chain,
    asset: sku.asset,
    status: "pending",
    signature: null,
    paid_amount_usd: null,
    payer_address: null,
    pass_id: null,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + PAY_EXPIRY_MS).toISOString(),
    paid_at: null,
  };
}

export function passDraft(tokenHash: string, input: IssuePassInput = {}): MeterPass {
  const now = input.nowMs ?? Date.now();
  const sku = meterSkuOrDefault(input.sku);
  return {
    id: newMeterId("pass"),
    token_hash: tokenHash,
    sku: sku.id,
    chain: sku.chain,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + sku.duration_sec * 1000).toISOString(),
    included_calls: sku.included_calls,
    used_calls: 0,
    payer_address: input.payer_address ?? null,
    invoice_id: input.invoice_id ?? null,
    signature: input.signature ?? null,
    paid_amount_usd: input.paid_amount_usd ?? null,
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function allowDevGrant(env = process.env): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.METER_DEV_GRANT === "1";
}

export function createMeterStore(): MeterStore {
  const passes = new Map<string, MeterPass>();
  const byHash = new Map<string, string>();
  const invoices = new Map<string, MeterInvoice>();
  const invoiceByRef = new Map<string, string>();
  const tokensByInvoice = new Map<string, string>();
  const logs: MeterCallLog[] = [];
  const spend = new Map<string, number>();
  const payments: MeterPaymentRow[] = [];
  const stamps = new Map<string, MeterStamp>();

  function spendKey(wallet: string, nowMs: number) {
    return `${wallet.trim().toLowerCase()}:${utcDayKey(nowMs)}`;
  }

  function expireInvoice(row: MeterInvoice, nowMs = Date.now()): MeterInvoice {
    if (row.status === "pending" && Date.parse(row.expires_at) <= nowMs) {
      const next = { ...row, status: "expired" as const };
      invoices.set(row.invoice_id, next);
      return next;
    }
    return row;
  }

  const store: MeterStore = {
    pendingApprovalsCreated: 0,
    createInvoice(opts = {}) {
      const invoice = invoiceDraft(opts);
      invoices.set(invoice.invoice_id, invoice);
      invoiceByRef.set(invoice.reference, invoice.invoice_id);
      return invoice;
    },
    getInvoice(idOrRef) {
      const key = idOrRef.trim();
      if (!key) return null;
      const idHit = invoices.get(key);
      if (idHit) return expireInvoice(idHit);
      const mapped = invoiceByRef.get(key);
      if (!mapped) return null;
      const row = invoices.get(mapped);
      return row ? expireInvoice(row) : null;
    },
    noteUnderpaid(invoiceId, signature, amountUsd) {
      const row = invoices.get(invoiceId);
      if (!row || row.status === "paid") return row ?? null;
      const next: MeterInvoice = {
        ...row,
        status: "underpaid",
        signature,
        paid_amount_usd: amountUsd,
      };
      invoices.set(invoiceId, next);
      return next;
    },
    fulfillInvoice(invoiceId, match) {
      const row = invoices.get(invoiceId);
      if (!row) {
        const issued = store.issuePass({
          sku: METER_PASS_SKU,
          payer_address: match.payer_address ?? null,
          signature: match.signature,
          paid_amount_usd: match.amountUsdc,
        }) as { pass: MeterPass; token: string };
        return {
          invoice: {
            invoice_id: invoiceId,
            reference: "",
            sku: issued.pass.sku,
            pay_to: SOLANA_PAYOUT_ADDRESS,
            amount_usd: METER_PASS_1H.price_usd,
            amount_base_units: METER_PASS_1H.amount_base_units,
            chain: METER_PASS_1H.chain,
            asset: METER_PASS_1H.asset,
            status: "paid",
            signature: match.signature,
            paid_amount_usd: match.amountUsdc,
            payer_address: match.payer_address ?? null,
            pass_id: issued.pass.id,
            created_at: issued.pass.created_at,
            expires_at: issued.pass.expires_at,
            paid_at: issued.pass.created_at,
          },
          pass: issued.pass,
          token: issued.token,
        };
      }
      const existingToken = tokensByInvoice.get(invoiceId);
      if (row.status === "paid" && row.pass_id && existingToken) {
        const pass = passes.get(row.pass_id);
        if (pass) return { invoice: row, pass, token: existingToken };
      }
      const issued = store.issuePass({
        sku: row.sku,
        payer_address: match.payer_address ?? row.payer_address,
        invoice_id: invoiceId,
        signature: match.signature,
        paid_amount_usd: match.amountUsdc,
      }) as { pass: MeterPass; token: string };
      const paidAt = new Date().toISOString();
      const next: MeterInvoice = {
        ...row,
        status: "paid",
        signature: match.signature,
        paid_amount_usd: match.amountUsdc,
        payer_address: match.payer_address ?? row.payer_address,
        pass_id: issued.pass.id,
        paid_at: paidAt,
      };
      invoices.set(invoiceId, next);
      tokensByInvoice.set(invoiceId, issued.token);
      payments.push({
        invoice_id: invoiceId,
        pass_id: issued.pass.id,
        signature: match.signature,
        amount_usd: match.amountUsdc,
        payer_address: next.payer_address,
        paid_at: paidAt,
      });
      return { invoice: next, pass: issued.pass, token: issued.token };
    },
    issuePass(input = {}) {
      const token = `acp_${randomBytes(18).toString("base64url")}`;
      const pass = passDraft(hashToken(token), input);
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
        id: newMeterId("mlog"),
        created_at: new Date().toISOString(),
      });
    },
    saveStamp(row) {
      stamps.set(row.id, row);
      return row;
    },
    getStamp(stampId) {
      return stamps.get(stampId) ?? null;
    },
    spentTodayUsd(wallet, nowMs = Date.now()) {
      return spend.get(spendKey(wallet, nowMs)) ?? 0;
    },
    addAllowSpend(wallet, valueUsd, nowMs = Date.now()) {
      const key = spendKey(wallet, nowMs);
      spend.set(key, (spend.get(key) ?? 0) + valueUsd);
    },
    report() {
      const all = [...invoices.values()].map((row) => expireInvoice(row));
      const paidRows = all.filter((row) => row.status === "paid");
      const pendingRows = all.filter((row) => row.status === "pending" || row.status === "underpaid");
      const payers = new Set(
        paidRows
          .map((row) => (row.payer_address || row.signature || row.invoice_id).toLowerCase())
          .filter(Boolean),
      );
      const usdcReceived = payments.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
      return {
        product: "Agent Meter",
        funds: {
          pay_to: SOLANA_PAYOUT_ADDRESS,
          chain: "solana",
          asset: "usdc",
        },
        invoices_created: all.length,
        invoices_paid: paidRows.length,
        invoices_pending: pendingRows.length,
        passes_issued: passes.size,
        agents_paid: payers.size,
        usdc_received: Number(usdcReceived.toFixed(6)),
        usdc_pending: Number(
          pendingRows.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0).toFixed(6),
        ),
        calls: logs.length,
        recent_payments: payments.slice(-50).reverse(),
        generated_at: new Date().toISOString(),
      };
    },
  };
  return store;
}

/** Process-local store for tests. Preview/production use SQL via getDefaultMeterStore. */
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
    covers: coversForSku(pass.sku),
    invoice_id: pass.invoice_id,
  };
}
