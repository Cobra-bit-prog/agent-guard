/**
 * Admin ping the first time a Meter invoice becomes paid.
 * Owner Sep-11 smoke invoices are skipped. Re-fulfill of an already-paid
 * invoice is skipped. Never throws.
 */
import { notifyPaidSubscriber, type PaidSubscriberNotice } from "../paid-subscriber-notify.ts";
import { isOwnerTestInvoice } from "./owner-test.ts";

export type MeterPaidNotice = {
  invoice_id: string;
  sku: string;
  amount_usd?: number | null;
  paid_amount_usd?: number | null;
  paid_at?: string | null;
  chain?: string | null;
};

export type MeterPaidNotifier = (
  invoice: MeterPaidNotice,
  previousStatus: string | null | undefined,
) => Promise<void>;

export function meterPaidPlanName(sku: string): string {
  const name = sku.trim() || "look";
  return `Meter ${name}`;
}

export function formatMeterPaidAmount(amount: number | null | undefined): string | undefined {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return undefined;
  return `${amount} USDC`;
}

function networkLabel(chain: string | null | undefined): string | undefined {
  const value = chain?.trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "solana") return "Solana";
  if (lower === "ethereum") return "Ethereum";
  if (lower === "base") return "Base";
  return value;
}

export async function notifyMeterInvoicePaid(
  invoice: MeterPaidNotice,
  previousStatus: string | null | undefined,
  send: (opts: PaidSubscriberNotice) => Promise<void> = notifyPaidSubscriber,
): Promise<void> {
  if (previousStatus === "paid") return;
  if (isOwnerTestInvoice(invoice.invoice_id)) return;
  const amount = formatMeterPaidAmount(invoice.paid_amount_usd ?? invoice.amount_usd);
  try {
    await send({
      planName: meterPaidPlanName(invoice.sku),
      at: invoice.paid_at || new Date().toISOString(),
      payRequestId: invoice.invoice_id,
      chain: networkLabel(invoice.chain),
      ...(amount ? { amount } : {}),
    });
  } catch (err) {
    console.error("[notify] meter paid email failed", err);
  }
}
