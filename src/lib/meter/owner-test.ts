/**
 * Owner smoke pays that must not be read as third-party Meter customers.
 *
 * The raw report totals (invoices_paid, agents_paid, usdc_received) stay
 * all-in. Scoreboard fields with a `_third_party` / `_owner_test` suffix
 * split those same paid rows.
 *
 * Extend this list when a future owner test settles. Invoice ids only —
 * no schema migration. agents_paid splits use the same payer key as the
 * raw count: lower(coalesce(nullif(payer_address,''), nullif(signature,''), id)).
 * A wallet that paid both an owner-test invoice and a real invoice is counted
 * in both cohorts and once in the raw agents_paid total.
 */
export const OWNER_TEST_INVOICE_IDS = [
  // Sep 11 owner pair, about $0.50 combined. Not customers.
  "inv_a3191eb70ed24026",
  "inv_202f5a771d4c6f77",
] as const;

const OWNER_TEST_INVOICE_ID_RE = /^inv_[a-z0-9]+$/;

const OWNER_TEST_INVOICE_ID_SET = new Set<string>(OWNER_TEST_INVOICE_IDS);

export type MeterPaidCohortRow = {
  invoice_id: string;
  payer_address?: string | null;
  signature?: string | null;
  amount_usd: number;
};

export type MeterPaidCohortSplit = {
  invoices_paid_owner_test: number;
  invoices_paid_third_party: number;
  agents_paid_owner_test: number;
  agents_paid_third_party: number;
  usdc_received_owner_test: number;
  usdc_received_third_party: number;
};

export const ZERO_PAID_COHORT_SPLIT: MeterPaidCohortSplit = {
  invoices_paid_owner_test: 0,
  invoices_paid_third_party: 0,
  agents_paid_owner_test: 0,
  agents_paid_third_party: 0,
  usdc_received_owner_test: 0,
  usdc_received_third_party: 0,
};

export function isOwnerTestInvoice(invoiceId: string | null | undefined): boolean {
  const id = invoiceId ?? "";
  return id !== "" && OWNER_TEST_INVOICE_ID_SET.has(id);
}

/**
 * SQL predicate for meter_invoices.id. Ids are a code allowlist; anything that
 * is not `inv_` plus lowercase alphanumerics is rejected so the fragment can
 * be interpolated into the report query.
 */
export function ownerTestInvoiceMatchSql(column = "id"): string {
  const ids = [...OWNER_TEST_INVOICE_IDS];
  for (const id of ids) {
    if (!OWNER_TEST_INVOICE_ID_RE.test(id)) {
      throw new Error(`OWNER_TEST_INVOICE_IDS contains an invalid invoice id: ${id}`);
    }
  }
  if (!/^[a-z_]+$/.test(column)) {
    throw new Error("owner-test SQL column must be a plain identifier");
  }
  if (ids.length === 0) return "false";
  return `${column} in (${ids.map((id) => `'${id}'`).join(", ")})`;
}

/** Same agent key as raw agents_paid on the internal Meter report. */
export function meterPaidAgentKey(row: {
  invoice_id: string;
  payer_address?: string | null;
  signature?: string | null;
}): string {
  const payer = row.payer_address ?? "";
  if (payer !== "") return payer.toLowerCase();
  const signature = row.signature ?? "";
  if (signature !== "") return signature.toLowerCase();
  return (row.invoice_id ?? "").toLowerCase();
}

export function splitPaidMeterRows(rows: MeterPaidCohortRow[]): MeterPaidCohortSplit {
  const ownerAgents = new Set<string>();
  const thirdAgents = new Set<string>();
  let ownerInvoices = 0;
  let thirdInvoices = 0;
  let ownerUsdc = 0;
  let thirdUsdc = 0;
  for (const row of rows) {
    const key = meterPaidAgentKey(row);
    const amount = Number(row.amount_usd || 0);
    if (isOwnerTestInvoice(row.invoice_id)) {
      ownerInvoices += 1;
      if (key) ownerAgents.add(key);
      ownerUsdc += amount;
    } else {
      thirdInvoices += 1;
      if (key) thirdAgents.add(key);
      thirdUsdc += amount;
    }
  }
  return {
    invoices_paid_owner_test: ownerInvoices,
    invoices_paid_third_party: thirdInvoices,
    agents_paid_owner_test: ownerAgents.size,
    agents_paid_third_party: thirdAgents.size,
    usdc_received_owner_test: Number(ownerUsdc.toFixed(6)),
    usdc_received_third_party: Number(thirdUsdc.toFixed(6)),
  };
}
