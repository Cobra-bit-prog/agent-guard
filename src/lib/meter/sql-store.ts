import { createHash, randomBytes } from "node:crypto";
import { getSql, type Sql } from "../db.ts";
import { SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import { utcDayKey } from "./preflight.ts";
import { METER_PASS_1H, METER_PASS_SKU } from "./pricing.ts";
import {
  getMemoryMeterStore,
  invoiceDraft,
  newMeterId,
  passDraft,
  type MeterCallLog,
  type MeterInvoice,
  type MeterPass,
  type MeterPaymentRow,
  type MeterReport,
  type MeterStamp,
  type MeterStore,
} from "./store.ts";

type InvoiceRow = {
  id: string;
  reference: string;
  sku: string;
  pay_to: string;
  amount_usd: unknown;
  amount_base_units: string;
  chain: string;
  asset: string;
  status: string;
  signature: string | null;
  paid_amount_usd: unknown;
  payer_address: string | null;
  pass_id: string | null;
  created_at: unknown;
  expires_at: unknown;
  paid_at: unknown;
};

type PassRow = {
  id: string;
  token_hash: string;
  token: string | null;
  sku: string;
  chain: string;
  payer_address: string | null;
  included_calls: unknown;
  used_calls: unknown;
  created_at: unknown;
  expires_at: unknown;
  signature: string | null;
  paid_amount_usd: unknown;
  invoice_id: string | null;
};

type StampRow = {
  id: string;
  pass_id: string;
  decision: string;
  chain: string;
  wallet: string | null;
  address: string | null;
  value_usd: unknown;
  hmac: string;
  created_at: unknown;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function iso(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStatus(value: string): MeterInvoice["status"] {
  if (value === "paid" || value === "expired" || value === "underpaid") return value;
  return "pending";
}

function mapInvoice(row: InvoiceRow): MeterInvoice {
  return {
    invoice_id: row.id,
    reference: row.reference,
    sku: row.sku,
    pay_to: row.pay_to,
    amount_usd: num(row.amount_usd),
    amount_base_units: String(row.amount_base_units),
    chain: row.chain,
    asset: row.asset,
    status: asStatus(row.status),
    signature: row.signature,
    paid_amount_usd: row.paid_amount_usd == null ? null : num(row.paid_amount_usd),
    payer_address: row.payer_address,
    pass_id: row.pass_id,
    created_at: iso(row.created_at),
    expires_at: iso(row.expires_at),
    paid_at: row.paid_at ? iso(row.paid_at) : null,
  };
}

function mapPass(row: PassRow): MeterPass {
  return {
    id: row.id,
    token_hash: row.token_hash,
    sku: row.sku,
    chain: row.chain,
    created_at: iso(row.created_at),
    expires_at: iso(row.expires_at),
    included_calls: num(row.included_calls),
    used_calls: num(row.used_calls),
    payer_address: row.payer_address,
    invoice_id: row.invoice_id,
    signature: row.signature,
    paid_amount_usd: row.paid_amount_usd == null ? null : num(row.paid_amount_usd),
  };
}

function mapStamp(row: StampRow): MeterStamp {
  const decision = row.decision === "stop" ? "stop" : "allow";
  return {
    id: row.id,
    pass_id: row.pass_id,
    decision,
    chain: row.chain,
    wallet: row.wallet,
    address: row.address,
    value_usd: row.value_usd == null ? null : num(row.value_usd),
    hmac: row.hmac,
    created_at: iso(row.created_at),
  };
}

export async function ensureMeterSchema(sql?: Sql): Promise<void> {
  const db = sql ?? (await getSql());
  await db.query(`
    create table if not exists meter_passes (
      id text primary key,
      token_hash text not null unique,
      sku text not null,
      chain text not null,
      payer_address text,
      included_calls integer not null,
      used_calls integer not null default 0,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);
  await db.query(`create index if not exists meter_passes_hash_idx on meter_passes (token_hash)`);
  await db.query(`
    create table if not exists meter_calls (
      id text primary key,
      pass_id text not null,
      kind text not null,
      chain text not null,
      wallet text,
      address text,
      value_usd numeric,
      decision text,
      created_at timestamptz not null default now()
    )
  `);
  await db.query(`create index if not exists meter_calls_pass_idx on meter_calls (pass_id, created_at desc)`);
  await db.query(`create index if not exists meter_calls_wallet_day_idx on meter_calls (wallet, created_at desc)`);
  await db.query(`alter table meter_passes add column if not exists signature text`);
  await db.query(`alter table meter_passes add column if not exists paid_amount_usd numeric`);
  await db.query(`alter table meter_passes add column if not exists invoice_id text`);
  await db.query(`alter table meter_passes add column if not exists token text`);
  await db.query(`
    create table if not exists meter_invoices (
      id text primary key,
      reference text not null unique,
      sku text not null,
      pay_to text not null,
      amount_usd numeric not null,
      amount_base_units text not null,
      chain text not null,
      asset text not null,
      status text not null default 'pending',
      signature text,
      paid_amount_usd numeric,
      payer_address text,
      pass_id text,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      paid_at timestamptz
    )
  `);
  await db.query(`create index if not exists meter_invoices_status_idx on meter_invoices (status, created_at desc)`);
  await db.query(`create index if not exists meter_invoices_ref_idx on meter_invoices (reference)`);
  await db.query(`
    create table if not exists meter_stamps (
      id text primary key,
      pass_id text not null,
      decision text not null,
      chain text not null,
      wallet text,
      address text,
      value_usd numeric,
      hmac text not null,
      created_at timestamptz not null default now()
    )
  `);
  await db.query(`create index if not exists meter_stamps_pass_idx on meter_stamps (pass_id, created_at desc)`);
}

async function expireIfNeeded(db: Sql, row: MeterInvoice, nowMs = Date.now()): Promise<MeterInvoice> {
  if (row.status === "pending" && Date.parse(row.expires_at) <= nowMs) {
    await db`update meter_invoices set status = ${"expired"} where id = ${row.invoice_id} and status = ${"pending"}`;
    return { ...row, status: "expired" };
  }
  return row;
}

export function createSqlMeterStore(db: Sql): MeterStore {
  const store: MeterStore = {
    pendingApprovalsCreated: 0,
    async createInvoice(opts = {}) {
      const invoice = invoiceDraft(opts);
      await db`
        insert into meter_invoices (
          id, reference, sku, pay_to, amount_usd, amount_base_units, chain, asset,
          status, created_at, expires_at
        ) values (
          ${invoice.invoice_id}, ${invoice.reference}, ${invoice.sku}, ${invoice.pay_to},
          ${invoice.amount_usd}, ${invoice.amount_base_units}, ${invoice.chain}, ${invoice.asset},
          ${invoice.status}, ${invoice.created_at}, ${invoice.expires_at}
        )
      `;
      return invoice;
    },
    async getInvoice(idOrRef) {
      const key = idOrRef.trim();
      if (!key) return null;
      const rows = await db.query<InvoiceRow>(
        `select * from meter_invoices where id = $1 or reference = $1 limit 1`,
        [key],
      );
      if (!rows[0]) return null;
      return expireIfNeeded(db, mapInvoice(rows[0]));
    },
    async noteUnderpaid(invoiceId, signature, amountUsd) {
      const current = await store.getInvoice(invoiceId);
      if (!current || current.status === "paid") return current;
      await db`
        update meter_invoices
        set status = ${"underpaid"}, signature = ${signature}, paid_amount_usd = ${amountUsd}
        where id = ${invoiceId} and status <> ${"paid"}
      `;
      return { ...current, status: "underpaid", signature, paid_amount_usd: amountUsd };
    },
    async fulfillInvoice(invoiceId, match) {
      const existing = await store.getInvoice(invoiceId);
      if (existing?.status === "paid" && existing.pass_id) {
        const passRows = await db.query<PassRow>(`select * from meter_passes where id = $1 limit 1`, [existing.pass_id]);
        if (passRows[0]?.token) {
          return { invoice: existing, pass: mapPass(passRows[0]), token: passRows[0].token };
        }
      }
      const issued = await store.issuePass({
        sku: existing?.sku ?? METER_PASS_SKU,
        payer_address: match.payer_address ?? existing?.payer_address ?? null,
        invoice_id: invoiceId,
        signature: match.signature,
        paid_amount_usd: match.amountUsdc,
      });
      const paidAt = new Date().toISOString();
      if (existing) {
        await db`
          update meter_invoices
          set status = ${"paid"},
              signature = ${match.signature},
              paid_amount_usd = ${match.amountUsdc},
              payer_address = ${match.payer_address ?? existing.payer_address},
              pass_id = ${issued.pass.id},
              paid_at = ${paidAt}
          where id = ${invoiceId}
        `;
        return {
          invoice: {
            ...existing,
            status: "paid",
            signature: match.signature,
            paid_amount_usd: match.amountUsdc,
            payer_address: match.payer_address ?? existing.payer_address,
            pass_id: issued.pass.id,
            paid_at: paidAt,
          },
          pass: issued.pass,
          token: issued.token,
        };
      }
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
          paid_at: paidAt,
        },
        pass: issued.pass,
        token: issued.token,
      };
    },
    async issuePass(input = {}) {
      const token = `acp_${randomBytes(18).toString("base64url")}`;
      const pass = passDraft(hashToken(token), input);
      await db`
        insert into meter_passes (
          id, token_hash, token, sku, chain, payer_address, included_calls, used_calls,
          created_at, expires_at, signature, paid_amount_usd, invoice_id
        ) values (
          ${pass.id}, ${pass.token_hash}, ${token}, ${pass.sku}, ${pass.chain}, ${pass.payer_address},
          ${pass.included_calls}, ${pass.used_calls}, ${pass.created_at}, ${pass.expires_at},
          ${pass.signature}, ${pass.paid_amount_usd}, ${pass.invoice_id}
        )
      `;
      return { pass, token };
    },
    async getPassByToken(token, nowMs = Date.now()) {
      const raw = token.trim();
      if (!raw) return null;
      const rows = await db.query<PassRow>(`select * from meter_passes where token_hash = $1 limit 1`, [hashToken(raw)]);
      if (!rows[0]) return null;
      const pass = mapPass(rows[0]);
      if (Date.parse(pass.expires_at) <= nowMs) return null;
      if (pass.used_calls >= pass.included_calls) return null;
      return pass;
    },
    async getPassById(passId) {
      const rows = await db.query<PassRow>(`select * from meter_passes where id = $1 limit 1`, [passId]);
      return rows[0] ? mapPass(rows[0]) : null;
    },
    async consumeCall(pass) {
      if (pass.used_calls >= pass.included_calls) return "exhausted";
      const rows = await db.query<PassRow>(
        `update meter_passes set used_calls = used_calls + 1
         where id = $1 and used_calls < included_calls returning *`,
        [pass.id],
      );
      if (!rows[0]) return "exhausted";
      return mapPass(rows[0]);
    },
    async logCall(row: Omit<MeterCallLog, "id" | "created_at">) {
      await db`
        insert into meter_calls (id, pass_id, kind, chain, wallet, address, value_usd, decision)
        values (
          ${newMeterId("mlog")}, ${row.pass_id}, ${row.kind}, ${row.chain},
          ${row.wallet}, ${row.address}, ${row.value_usd}, ${row.decision}
        )
      `;
    },
    async spentTodayUsd(wallet, nowMs = Date.now()) {
      const start = `${utcDayKey(nowMs)}T00:00:00.000Z`;
      const rows = await db.query<{ spent: unknown }>(
        `select coalesce(sum(value_usd), 0) as spent
         from meter_calls
         where lower(coalesce(wallet, '')) = $1
           and kind = 'preflight' and decision = 'allow'
           and created_at >= $2::timestamptz`,
        [wallet.trim().toLowerCase(), start],
      );
      return num(rows[0]?.spent);
    },
    async addAllowSpend() {},
    async saveStamp(row) {
      await db`
        insert into meter_stamps (
          id, pass_id, decision, chain, wallet, address, value_usd, hmac, created_at
        ) values (
          ${row.id}, ${row.pass_id}, ${row.decision}, ${row.chain},
          ${row.wallet}, ${row.address}, ${row.value_usd}, ${row.hmac}, ${row.created_at}
        )
      `;
      return row;
    },
    async getStamp(stampId) {
      const key = stampId.trim();
      if (!key) return null;
      const rows = await db.query<StampRow>(`select * from meter_stamps where id = $1 limit 1`, [key]);
      return rows[0] ? mapStamp(rows[0]) : null;
    },
    async report() {
      return collectMeterSqlReport(db);
    },
  };
  return store;
}

export async function collectMeterSqlReport(sql?: Sql): Promise<MeterReport> {
  const db = sql ?? (await getSql());
  await ensureMeterSchema(db);
  const empty: MeterReport = {
    product: "Agent Meter",
    funds: { pay_to: SOLANA_PAYOUT_ADDRESS, chain: "solana", asset: "usdc" },
    invoices_created: 0,
    invoices_paid: 0,
    invoices_pending: 0,
    passes_issued: 0,
    agents_paid: 0,
    usdc_received: 0,
    usdc_pending: 0,
    calls: 0,
    recent_payments: [],
    generated_at: new Date().toISOString(),
  };
  try {
    const totals = await db.query<{
      invoices_created: unknown;
      invoices_paid: unknown;
      invoices_pending: unknown;
      usdc_received: unknown;
      usdc_pending: unknown;
      agents_paid: unknown;
    }>(
      `select
         count(*)::int as invoices_created,
         count(*) filter (where status = 'paid')::int as invoices_paid,
         count(*) filter (where status in ('pending', 'underpaid'))::int as invoices_pending,
         coalesce(sum(paid_amount_usd) filter (where status = 'paid'), 0) as usdc_received,
         coalesce(sum(amount_usd) filter (where status in ('pending', 'underpaid')), 0) as usdc_pending,
         count(distinct lower(coalesce(nullif(payer_address, ''), nullif(signature, ''), id)))
           filter (where status = 'paid')::int as agents_paid
       from meter_invoices`,
    );
    const passes = await db.query<{ n: unknown }>(`select count(*)::int as n from meter_passes`);
    const calls = await db.query<{ n: unknown }>(`select count(*)::int as n from meter_calls`);
    const recent = await db.query<{
      id: string;
      pass_id: string | null;
      signature: string | null;
      paid_amount_usd: unknown;
      payer_address: string | null;
      paid_at: unknown;
    }>(
      `select id, pass_id, signature, paid_amount_usd, payer_address, paid_at
       from meter_invoices where status = 'paid' order by paid_at desc nulls last limit 50`,
    );
    const invoicesPending = num(totals[0]?.invoices_pending);
    const usdcReceived = num(totals[0]?.usdc_received);
    const usdcPending = num(totals[0]?.usdc_pending);
    const recentPayments: MeterPaymentRow[] = recent.map((row) => ({
      invoice_id: row.id,
      pass_id: row.pass_id,
      signature: row.signature ?? "",
      amount_usd: num(row.paid_amount_usd),
      payer_address: row.payer_address,
      paid_at: row.paid_at ? iso(row.paid_at) : "",
    }));
    return {
      product: "Agent Meter",
      funds: { pay_to: SOLANA_PAYOUT_ADDRESS, chain: "solana", asset: "usdc" },
      invoices_created: num(totals[0]?.invoices_created),
      invoices_paid: num(totals[0]?.invoices_paid),
      invoices_pending: invoicesPending,
      passes_issued: num(passes[0]?.n),
      agents_paid: num(totals[0]?.agents_paid),
      usdc_received: Number(usdcReceived.toFixed(6)),
      usdc_pending: Number(usdcPending.toFixed(6)),
      calls: num(calls[0]?.n),
      recent_payments: recentPayments,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[meter] sql report failed", err);
    return empty;
  }
}

export async function getSqlMeterStore(): Promise<MeterStore> {
  const sql = await getSql();
  await ensureMeterSchema(sql);
  return createSqlMeterStore(sql);
}

export async function getDefaultMeterStore(): Promise<MeterStore> {
  if (process.env.NODE_ENV === "test" || process.env.METER_MEMORY === "1") {
    return getMemoryMeterStore();
  }
  try {
    return await getSqlMeterStore();
  } catch (err) {
    console.error("[meter] sql store unavailable, memory fallback", err);
    return getMemoryMeterStore();
  }
}
