import { paymentsFromHeliusPayload, type HeliusPayment, type MatchResult } from "../pay-invoice.ts";
import { lockedSolanaUsdcRecipient } from "../solana-pay.ts";
import { METER_PASS_1H } from "./pricing.ts";
import type { MeterInvoice, MeterStore } from "./store.ts";

export type MeterChainFinder = (opts: {
  reference: string;
  recipient: string;
  amountUsdc: number;
}) => Promise<MatchResult>;

export function meterFundsDestination() {
  return {
    pay_to: lockedSolanaUsdcRecipient(),
    chain: "solana" as const,
    asset: "usdc" as const,
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    note: "Same locked Phantom receive wallet as Human App $29. Query strings and env overrides cannot retarget funds.",
  };
}

export function paidEnough(amountUsdc: number, need = METER_PASS_1H.price_usd): boolean {
  return Number(amountUsdc) + 1e-9 >= need;
}

/** Mark invoice paid and mint a pass. Idempotent. */
export function mintPassForPaidInvoice(
  store: MeterStore,
  invoice: MeterInvoice,
  match: { signature: string; amountUsdc: number; payer_address?: string | null },
) {
  return store.fulfillInvoice(invoice.invoice_id, match);
}

export async function watchMeterInvoice(
  store: MeterStore,
  invoice: MeterInvoice,
  finder: MeterChainFinder,
): Promise<{ invoice: MeterInvoice; token: string | null; match: MatchResult }> {
  const current = (await store.getInvoice(invoice.invoice_id)) ?? invoice;
  if (current.status === "paid") {
    const issued = await store.fulfillInvoice(current.invoice_id, {
      signature: current.signature ?? "on_file",
      amountUsdc: current.paid_amount_usd ?? METER_PASS_1H.price_usd,
      payer_address: current.payer_address,
    });
    return {
      invoice: issued.invoice,
      token: issued.token,
      match: {
        kind: "paid",
        signature: issued.invoice.signature ?? "on_file",
        amountUsdc: issued.invoice.paid_amount_usd ?? METER_PASS_1H.price_usd,
      },
    };
  }

  let match: MatchResult = { kind: "none" };
  try {
    match = await finder({
      reference: current.reference,
      recipient: lockedSolanaUsdcRecipient(current.pay_to),
      amountUsdc: current.amount_usd || METER_PASS_1H.price_usd,
    });
  } catch {
    match = { kind: "none" };
  }

  if (match.kind === "paid") {
    const issued = await store.fulfillInvoice(current.invoice_id, {
      signature: match.signature,
      amountUsdc: match.amountUsdc,
    });
    return { invoice: issued.invoice, token: issued.token, match };
  }

  if (match.kind === "underpaid") {
    await store.noteUnderpaid(current.invoice_id, match.signature, match.amountUsdc);
    return { invoice: (await store.getInvoice(current.invoice_id)) ?? current, token: null, match };
  }

  return { invoice: current, token: null, match };
}

export async function applyMeterHeliusPayments(
  store: MeterStore,
  body: unknown,
): Promise<Array<{ invoice_id: string; signature: string }>> {
  const payments = paymentsFromHeliusPayload(body, lockedSolanaUsdcRecipient());
  return applyMeterPayments(store, payments);
}

export async function applyMeterPayments(
  store: MeterStore,
  payments: HeliusPayment[],
): Promise<Array<{ invoice_id: string; signature: string }>> {
  const paid: Array<{ invoice_id: string; signature: string }> = [];
  for (const pay of payments) {
    for (const key of pay.references) {
      const invoice = await store.getInvoice(key);
      if (!invoice || invoice.status === "paid") continue;
      if (!paidEnough(pay.amountUsdc, invoice.amount_usd)) continue;
      const issued = await store.fulfillInvoice(invoice.invoice_id, {
        signature: pay.signature,
        amountUsdc: pay.amountUsdc,
      });
      paid.push({ invoice_id: issued.invoice.invoice_id, signature: pay.signature });
    }
  }
  return paid;
}
