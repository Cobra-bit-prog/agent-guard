import { randomBytes } from "node:crypto";
import { newPayReference } from "./pay-invoice.ts";
import { PAY_EXPIRY_MS, lockedSolanaUsdcRecipient } from "./solana-pay.ts";
import { lockedEvmUsdcRecipient } from "./evm-pay.ts";
import {
  SPEND_AUDIT_AMOUNT_BASE_UNITS,
  SPEND_AUDIT_LOOKBACK_DAYS,
  SPEND_AUDIT_PRICE_USD,
  SPEND_AUDIT_SKU,
  type SpendAuditChain,
  type SpendAuditInvoice,
  type SpendAuditSnapshot,
} from "./spend-audit.ts";

export type CreateSpendAuditInvoiceInput = {
  address: string;
  chain: SpendAuditChain;
  lookbackDays?: number;
  nowMs?: number;
};

export type FulfillSpendAuditMatch = {
  signature: string;
  amountUsdc: number;
  payer_address?: string | null;
};

export type SpendAuditStore = {
  createInvoice(input: CreateSpendAuditInvoiceInput): Promise<SpendAuditInvoice>;
  getInvoice(idOrRef: string): Promise<SpendAuditInvoice | null>;
  noteUnderpaid(invoiceId: string, signature: string, amountUsd: number): Promise<SpendAuditInvoice | null>;
  fulfillInvoice(invoiceId: string, match: FulfillSpendAuditMatch): Promise<SpendAuditInvoice | null>;
  saveSnapshot(invoiceId: string, snapshot: SpendAuditSnapshot): Promise<SpendAuditInvoice | null>;
};

function newAuditId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function spendAuditInvoiceDraft(input: CreateSpendAuditInvoiceInput): SpendAuditInvoice {
  const nowMs = input.nowMs ?? Date.now();
  return {
    invoice_id: newAuditId("aud"),
    reference: newPayReference(),
    sku: SPEND_AUDIT_SKU,
    pay_to: lockedSolanaUsdcRecipient(),
    base_pay_to: lockedEvmUsdcRecipient(),
    amount_usd: SPEND_AUDIT_PRICE_USD,
    amount_base_units: SPEND_AUDIT_AMOUNT_BASE_UNITS,
    chain: input.chain,
    address: input.address.trim(),
    lookback_days: input.lookbackDays ?? SPEND_AUDIT_LOOKBACK_DAYS,
    asset: "usdc",
    status: "pending",
    signature: null,
    paid_amount_usd: null,
    payer_address: null,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + PAY_EXPIRY_MS).toISOString(),
    paid_at: null,
    snapshot: null,
  };
}

export function allowSpendAuditDevGrant(env = process.env): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.SPEND_AUDIT_DEV_GRANT === "1" || env.METER_DEV_GRANT === "1";
}

export function createSpendAuditStore(): SpendAuditStore {
  const invoices = new Map<string, SpendAuditInvoice>();
  const byRef = new Map<string, string>();

  function expire(row: SpendAuditInvoice, nowMs = Date.now()): SpendAuditInvoice {
    if (row.status === "pending" && Date.parse(row.expires_at) <= nowMs) {
      const next = { ...row, status: "expired" as const };
      invoices.set(row.invoice_id, next);
      return next;
    }
    return row;
  }

  const store: SpendAuditStore = {
    async createInvoice(input) {
      const invoice = spendAuditInvoiceDraft(input);
      invoices.set(invoice.invoice_id, invoice);
      byRef.set(invoice.reference, invoice.invoice_id);
      return invoice;
    },
    async getInvoice(idOrRef) {
      const key = idOrRef.trim();
      if (!key) return null;
      const hit = invoices.get(key);
      if (hit) return expire(hit);
      const mapped = byRef.get(key);
      if (!mapped) return null;
      const row = invoices.get(mapped);
      return row ? expire(row) : null;
    },
    async noteUnderpaid(invoiceId, signature, amountUsd) {
      const row = invoices.get(invoiceId);
      if (!row || row.status === "paid") return row ?? null;
      const next: SpendAuditInvoice = {
        ...row,
        status: "underpaid",
        signature,
        paid_amount_usd: amountUsd,
      };
      invoices.set(invoiceId, next);
      return next;
    },
    async fulfillInvoice(invoiceId, match) {
      const row = invoices.get(invoiceId);
      if (!row) return null;
      if (row.status === "paid") return row;
      const next: SpendAuditInvoice = {
        ...row,
        status: "paid",
        signature: match.signature,
        paid_amount_usd: match.amountUsdc,
        payer_address: match.payer_address ?? null,
        paid_at: new Date().toISOString(),
      };
      invoices.set(invoiceId, next);
      return next;
    },
    async saveSnapshot(invoiceId, snapshot) {
      const row = invoices.get(invoiceId);
      if (!row) return null;
      const next = { ...row, snapshot };
      invoices.set(invoiceId, next);
      return next;
    },
  };
  return store;
}

let memoryStore: SpendAuditStore | null = null;

export function getMemorySpendAuditStore(): SpendAuditStore {
  memoryStore ??= createSpendAuditStore();
  return memoryStore;
}
