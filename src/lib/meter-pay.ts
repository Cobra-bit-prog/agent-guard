import {
  buildSolanaPayUrl,
  formatUsdcExact,
  isSolanaPayReference,
  lockedSolanaUsdcRecipient,
  parseSolanaPayUrl,
  phantomBrowseUrl,
  SOLANA_PAYOUT_ADDRESS,
  usdcBaseUnits,
} from "./solana-pay.ts";

export const METER_LAPTOP_PAY_PATH = "/meter/pay";
export const METER_LAPTOP_PAY_URL = "https://agent-control.net/meter/pay";

export type MeterPaySearch = {
  invoice_id?: string;
  pay_url?: string;
  amount?: string;
  reference?: string;
};

export type MeterInvoicePayload = {
  invoice_id?: string;
  status?: string;
  reference?: string;
  pay_to?: string;
  amount_usd?: number;
  amount_base_units?: string;
  pay_url?: string;
  signature?: string | null;
  pass_id?: string | null;
  token?: string;
  error?: string;
};

export type MeterPayIntent = {
  invoiceId: string | null;
  amountUsdc: number;
  amountBaseUnits: string;
  reference: string;
  recipient: string;
  payUrl: string;
  phantomUrl: string;
};

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function decodeMaybeUri(value: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseAmount(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  const text = asTrimmed(raw);
  if (!text) return fallback;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseMeterPaySearch(search: Record<string, unknown>): MeterPaySearch {
  const invoice_id = asTrimmed(search.invoice_id) || asTrimmed(search.id);
  const pay_url = decodeMaybeUri(asTrimmed(search.pay_url) || asTrimmed(search.payUrl));
  const amount = asTrimmed(search.amount);
  const reference = asTrimmed(search.reference);
  const out: MeterPaySearch = {};
  if (invoice_id) out.invoice_id = invoice_id;
  if (pay_url) out.pay_url = pay_url;
  if (amount) out.amount = amount;
  if (reference) out.reference = reference;
  // search.pay_to / recipient are ignored — query strings cannot retarget funds.
  return out;
}

export function meterLaptopPayHref(invoiceId: string): string {
  const id = invoiceId.trim();
  if (!id) return METER_LAPTOP_PAY_PATH;
  return `${METER_LAPTOP_PAY_PATH}?invoice_id=${encodeURIComponent(id)}`;
}

function intentFromParts(opts: {
  invoiceId?: string | null;
  amountUsdc: number;
  amountBaseUnits?: string;
  reference: string;
}): MeterPayIntent {
  const recipient = lockedSolanaUsdcRecipient();
  const amountUsdc = parseAmount(opts.amountUsdc, 0.25);
  const amountBaseUnits = opts.amountBaseUnits?.trim() || usdcBaseUnits(amountUsdc);
  const payUrl = buildSolanaPayUrl({
    recipient,
    amountUsdc,
    reference: opts.reference,
  });
  return {
    invoiceId: opts.invoiceId?.trim() || null,
    amountUsdc,
    amountBaseUnits,
    reference: opts.reference,
    recipient,
    payUrl,
    phantomUrl: phantomBrowseUrl(payUrl),
  };
}

export function resolveMeterPayIntent(opts: {
  search: MeterPaySearch;
  invoice?: MeterInvoicePayload | null;
}): { ok: true; intent: MeterPayIntent } | { ok: false; error: string } {
  const invoice = opts.invoice;
  const fromInvoiceRef = asTrimmed(invoice?.reference);
  const fromSearchRef = asTrimmed(opts.search.reference);
  const parsedUrl = opts.search.pay_url ? parseSolanaPayUrl(opts.search.pay_url) : null;
  const parsedInvoiceUrl = invoice?.pay_url ? parseSolanaPayUrl(invoice.pay_url) : null;

  const reference =
    (isSolanaPayReference(fromInvoiceRef) ? fromInvoiceRef : "") ||
    (parsedInvoiceUrl?.reference ?? "") ||
    (parsedUrl?.reference ?? "") ||
    (isSolanaPayReference(fromSearchRef) ? fromSearchRef : "");

  if (!reference) {
    return { ok: false, error: "Need an invoice or a Solana Pay reference to pay." };
  }

  const amountUsdc = parseAmount(
    invoice?.amount_usd ?? parsedInvoiceUrl?.amountUsdc ?? parsedUrl?.amountUsdc ?? opts.search.amount,
    0.25,
  );
  const amountBaseUnits =
    asTrimmed(invoice?.amount_base_units) || usdcBaseUnits(amountUsdc);

  return {
    ok: true,
    intent: intentFromParts({
      invoiceId: asTrimmed(invoice?.invoice_id) || asTrimmed(opts.search.invoice_id) || null,
      amountUsdc,
      amountBaseUnits,
      reference,
    }),
  };
}

export function displayMeterAmount(intent: MeterPayIntent): string {
  return formatUsdcExact(intent.amountBaseUnits);
}

export { SOLANA_PAYOUT_ADDRESS };
