import { getSql, type Sql } from "@/lib/db";
import {
  allowSpendAuditDevGrant,
  createSpendAuditStore,
  getMemorySpendAuditStore,
  spendAuditInvoiceDraft,
  type FulfillSpendAuditMatch,
  type SpendAuditStore,
} from "../spend-audit-store.ts";
import type { SpendAuditInvoice, SpendAuditSnapshot } from "../spend-audit.ts";

export { allowSpendAuditDevGrant, createSpendAuditStore, getMemorySpendAuditStore };

type InvoiceRow = {
  id: string;
  reference: string;
  sku: string;
  pay_to: string;
  base_pay_to: string;
  amount_usd: unknown;
  amount_base_units: string;
  chain: string;
  address: string;
  lookback_days: unknown;
  asset: string;
  status: string;
  signature: string | null;
  paid_amount_usd: unknown;
  payer_address: string | null;
  created_at: unknown;
  expires_at: unknown;
  paid_at: unknown;
  snapshot: unknown;
};

function iso(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStatus(value: string): SpendAuditInvoice["status"] {
  if (value === "paid" || value === "expired" || value === "underpaid") return value;
  return "pending";
}

function parseSnapshot(raw: unknown): SpendAuditSnapshot | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as SpendAuditSnapshot;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as SpendAuditSnapshot;
  return null;
}

function mapInvoice(row: InvoiceRow): SpendAuditInvoice {
  return {
    invoice_id: row.id,
    reference: row.reference,
    sku: "wallet_spend_audit",
    pay_to: row.pay_to,
    base_pay_to: row.base_pay_to,
    amount_usd: num(row.amount_usd),
    amount_base_units: String(row.amount_base_units),
    chain: row.chain as SpendAuditInvoice["chain"],
    address: row.address,
    lookback_days: num(row.lookback_days, 30),
    asset: "usdc",
    status: asStatus(row.status),
    signature: row.signature,
    paid_amount_usd: row.paid_amount_usd == null ? null : num(row.paid_amount_usd),
    payer_address: row.payer_address,
    created_at: iso(row.created_at),
    expires_at: iso(row.expires_at),
    paid_at: row.paid_at ? iso(row.paid_at) : null,
    snapshot: parseSnapshot(row.snapshot),
  };
}

export async function ensureSpendAuditSchema(sql?: Sql): Promise<void> {
  const db = sql ?? (await getSql());
  await db.query(`
    create table if not exists spend_audit_invoices (
      id text primary key,
      reference text not null unique,
      sku text not null,
      pay_to text not null,
      base_pay_to text not null,
      amount_usd numeric not null,
      amount_base_units text not null,
      chain text not null,
      address text not null,
      lookback_days integer not null,
      asset text not null default 'usdc',
      status text not null default 'pending',
      signature text,
      paid_amount_usd numeric,
      payer_address text,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      paid_at timestamptz,
      snapshot jsonb
    )
  `);
  await db.query(`create index if not exists spend_audit_invoices_ref_idx on spend_audit_invoices (reference)`);
  await db.query(
    `create index if not exists spend_audit_invoices_status_idx on spend_audit_invoices (status, created_at desc)`,
  );
}

async function expireIfNeeded(db: Sql, row: SpendAuditInvoice, nowMs = Date.now()): Promise<SpendAuditInvoice> {
  if (row.status === "pending" && Date.parse(row.expires_at) <= nowMs) {
    await db`update spend_audit_invoices set status = ${"expired"} where id = ${row.invoice_id} and status = ${"pending"}`;
    return { ...row, status: "expired" };
  }
  return row;
}

export function createSqlSpendAuditStore(db: Sql): SpendAuditStore {
  const store: SpendAuditStore = {
    async createInvoice(input) {
      const invoice = spendAuditInvoiceDraft(input);
      await db`
        insert into spend_audit_invoices (
          id, reference, sku, pay_to, base_pay_to, amount_usd, amount_base_units,
          chain, address, lookback_days, asset, status, created_at, expires_at
        ) values (
          ${invoice.invoice_id}, ${invoice.reference}, ${invoice.sku}, ${invoice.pay_to},
          ${invoice.base_pay_to}, ${invoice.amount_usd}, ${invoice.amount_base_units},
          ${invoice.chain}, ${invoice.address}, ${invoice.lookback_days}, ${invoice.asset},
          ${invoice.status}, ${invoice.created_at}, ${invoice.expires_at}
        )
      `;
      return invoice;
    },
    async getInvoice(idOrRef) {
      const key = idOrRef.trim();
      if (!key) return null;
      const rows = await db.query<InvoiceRow>(
        `select * from spend_audit_invoices where id = $1 or reference = $1 limit 1`,
        [key],
      );
      if (!rows[0]) return null;
      return expireIfNeeded(db, mapInvoice(rows[0]));
    },
    async noteUnderpaid(invoiceId, signature, amountUsd) {
      const current = await store.getInvoice(invoiceId);
      if (!current || current.status === "paid") return current;
      await db`
        update spend_audit_invoices
        set status = ${"underpaid"}, signature = ${signature}, paid_amount_usd = ${amountUsd}
        where id = ${invoiceId} and status <> ${"paid"}
      `;
      return { ...current, status: "underpaid", signature, paid_amount_usd: amountUsd };
    },
    async fulfillInvoice(invoiceId, match: FulfillSpendAuditMatch) {
      const current = await store.getInvoice(invoiceId);
      if (!current) return null;
      if (current.status === "paid") return current;
      const paidAt = new Date().toISOString();
      await db`
        update spend_audit_invoices
        set status = ${"paid"},
            signature = ${match.signature},
            paid_amount_usd = ${match.amountUsdc},
            payer_address = ${match.payer_address ?? null},
            paid_at = ${paidAt}
        where id = ${invoiceId} and status <> ${"paid"}
      `;
      return {
        ...current,
        status: "paid",
        signature: match.signature,
        paid_amount_usd: match.amountUsdc,
        payer_address: match.payer_address ?? null,
        paid_at: paidAt,
      };
    },
    async saveSnapshot(invoiceId, snapshot) {
      const current = await store.getInvoice(invoiceId);
      if (!current) return null;
      const payload = JSON.stringify(snapshot);
      await db`
        update spend_audit_invoices
        set snapshot = ${payload}::jsonb
        where id = ${invoiceId}
      `;
      return { ...current, snapshot };
    },
  };
  return store;
}

export async function getSqlSpendAuditStore(): Promise<SpendAuditStore> {
  const sql = await getSql();
  await ensureSpendAuditSchema(sql);
  return createSqlSpendAuditStore(sql);
}

export async function getDefaultSpendAuditStore(): Promise<SpendAuditStore> {
  if (process.env.NODE_ENV === "test" || process.env.METER_MEMORY === "1") {
    return getMemorySpendAuditStore();
  }
  try {
    return await getSqlSpendAuditStore();
  } catch (err) {
    console.error("[spend-audit] sql store unavailable, memory fallback", err);
    return getMemorySpendAuditStore();
  }
}
