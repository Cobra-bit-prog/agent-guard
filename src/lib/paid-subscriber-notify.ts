/**
 * One admin ping per real customer pay, via sendNewSubscriberNotifyEmail.
 * Human Starter/Pro/Team at checkout keep their existing call site.
 * This helper covers Action Gate, Shop Shield, guest→signup claim, and Meter.
 * Never throws — sendNewSubscriberNotifyEmail swallows Resend failures.
 */
import {
  sendNewSubscriberNotifyEmail,
  type NewSubscriberNotifyOpts,
} from "./auth/send-email.server.ts";
import { isGuestUserId } from "./pay-invoice.ts";
import { humanInboxPlan, isActionGatePlan, isShopShieldPlan, payPlanQuote } from "./shop-shield.ts";

export type PaidSubscriberNotice = Omit<NewSubscriberNotifyOpts, "kind">;

export async function notifyPaidSubscriber(opts: PaidSubscriberNotice): Promise<void> {
  await sendNewSubscriberNotifyEmail({ kind: "paid", ...opts });
}

/**
 * Plan name for a pay_request that is not a Human inbox seat.
 * Returns null for Starter/Pro/Team so those confirms are not emailed twice.
 */
export function nonInboxPaidPlanName(plan: unknown): string | null {
  if (humanInboxPlan(plan)) return null;
  if (isActionGatePlan(plan) || isShopShieldPlan(plan)) return payPlanQuote(plan).name;
  return null;
}

/** Plan label when a guest invoice is claimed. Human, Action Gate, and Shop Shield. */
export function claimedPaidPlanName(plan: unknown): string {
  return payPlanQuote(plan).name;
}

/**
 * Guest checkout does not notify at pay time. Claim is the first send.
 * An invoice already attached to the real user was notified when it was paid.
 */
export function shouldNotifyClaimedInvoice(previousUserId: string | null | undefined): boolean {
  return isGuestUserId(previousUserId);
}
