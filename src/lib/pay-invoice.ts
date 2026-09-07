/**
 * Human Solana Pay invoice: exact plan dollars, unique reference, locked receive wallet.
 * Match on Solana Pay reference — never unique dust amounts.
 */
import { APP_ORIGIN } from "./warning-alert.ts";
import { PLANS, type PlanId } from "./plans.ts";
import {
  PAY_EXPIRY_MS,
  SOLANA_PAYOUT_ADDRESS,
  USDC_MINT,
  buildSolanaPayUrl,
  phantomBrowseUrl,
  usdcBaseUnits,
  type PayStatus,
} from "./solana-pay.ts";

/** Production Phantom Solana USDC receive pubkey. Human checkout funds go here only. */
export { SOLANA_PAYOUT_ADDRESS };

export const PAID_PLAN_IDS = ["starter", "pro", "team"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export const TRIAL_REMIND_HOURS = 20;
export const TRIAL_REMIND_MS = TRIAL_REMIND_HOURS * 60 * 60 * 1000;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}

/** Random 32-byte Solana Pay reference pubkey (does not need to be on-curve). */
export function newPayReference(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase58(bytes);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parsePaidPlan(value: unknown): PaidPlanId {
  const id = String(value || "starter").toLowerCase();
  return (PAID_PLAN_IDS as readonly string[]).includes(id) ? (id as PaidPlanId) : "starter";
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  return email;
}

/** Ignore any candidate wallet. Query strings cannot retarget funds. */
export function receiveWallet(_candidate?: string | null): string {
  return SOLANA_PAYOUT_ADDRESS;
}

export type PayCopy = {
  title: string;
  body: string;
  cta: string;
  waiting: string;
  done: string;
  warn: string;
  trialMail: string;
};

export function copyFor(price: number): PayCopy {
  const n = Number(price);
  return {
    title: `Pay $${n}. Console stays on.`,
    body: `Send $${n} USDC on Solana. We unlock when it lands.`,
    cta: `Pay $${n}`,
    waiting: `Waiting for $${n} USDC on Solana.`,
    done: "Paid. Console is open.",
    warn: "Use a wallet. Do not send from Coinbase or Binance.",
    trialMail: "Your day is almost up. Pay $29 USDC on Solana to keep the console.",
  };
}

export function isForbiddenCustomerWord(text: string): boolean {
  const banned = [
    /\bwatcher\b/i,
    /unique amount/i,
    /\bmemo\b/i,
    /\bwired\b/i,
    /\bmagnet\b/i,
    /package scanner/i,
    /\bbroadcast\b/i,
  ];
  return banned.some((re) => re.test(String(text || "")));
}

export function isGuestUserId(userId: string | null | undefined): boolean {
  return !userId || userId.startsWith("guest:");
}

export function guestUserId(invoiceId: string): string {
  return `guest:${invoiceId}`;
}

export type TokenBal = {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { amount?: string; uiAmount?: number | null };
};

export type ParsedTx = {
  meta?: {
    err?: unknown;
    preTokenBalances?: TokenBal[];
    postTokenBalances?: TokenBal[];
  };
};

/** Token delta to recipient for USDC. Confirms the plan amount — not special dust. */
export function usdcDeltaToOwner(tx: ParsedTx | null | undefined, owner: string): bigint {
  const sum = (rows: TokenBal[] | undefined) =>
    (rows ?? []).reduce((acc, row) => {
      if (row.mint !== USDC_MINT) return acc;
      if (row.owner && row.owner !== owner) return acc;
      const amt = row.uiTokenAmount?.amount;
      if (!amt) return acc;
      try {
        return acc + BigInt(amt);
      } catch {
        return acc;
      }
    }, 0n);
  return sum(tx?.meta?.postTokenBalances) - sum(tx?.meta?.preTokenBalances);
}

export type MatchResult =
  | { kind: "none" }
  | { kind: "paid"; signature: string; amountUsdc: number }
  | { kind: "underpaid"; signature: string; amountUsdc: number };

export function matchUsdcByReference(opts: {
  recipient: string;
  amountUsdc: number;
  signatures: Array<{ signature: string; err?: unknown; tx?: ParsedTx | null }>;
}): MatchResult {
  const expected = BigInt(usdcBaseUnits(opts.amountUsdc));
  const signatures = opts.signatures || [];
  let bestUnder: MatchResult = { kind: "none" };
  for (const item of signatures) {
    if (item.err) continue;
    const tx = item.tx;
    if (!tx || tx.meta?.err) continue;
    const delta = usdcDeltaToOwner(tx, opts.recipient);
    if (delta <= 0n) continue;
    const amountUsdc = Number(delta) / 1e6;
    if (delta >= expected) {
      return { kind: "paid", signature: item.signature, amountUsdc };
    }
    bestUnder = { kind: "underpaid", signature: item.signature, amountUsdc };
  }
  return bestUnder;
}

export type HeliusPayment = {
  signature: string;
  amountUsdc: number;
  references: string[];
};

type HeliusEvent = {
  signature?: string;
  transactionSignature?: string;
  accountData?: Array<{ account?: string }>;
  tokenTransfers?: Array<{
    mint?: string;
    tokenAddress?: string;
    toUserAccount?: string;
    to?: string;
    tokenAmount?: number | string;
    amount?: number | string;
  }>;
  meta?: ParsedTx["meta"];
  transaction?: {
    transaction?: { message?: { accountKeys?: unknown } };
    message?: { accountKeys?: unknown };
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeHeliusEvents(body: unknown): HeliusEvent[] {
  if (Array.isArray(body)) return body as HeliusEvent[];
  const rec = asRecord(body);
  if (rec && Array.isArray(rec.events)) return rec.events as HeliusEvent[];
  if (rec) return [rec as HeliusEvent];
  return [];
}

function collectAccountKeys(ev: HeliusEvent): string[] {
  const keys = new Set<string>();
  for (const row of ev.accountData || []) {
    if (row?.account) keys.add(row.account);
  }
  const msgKeys =
    ev.transaction?.transaction?.message?.accountKeys ||
    ev.transaction?.message?.accountKeys ||
    [];
  if (Array.isArray(msgKeys)) {
    for (const k of msgKeys) {
      if (typeof k === "string") keys.add(k);
      else {
        const rec = asRecord(k);
        if (typeof rec?.pubkey === "string") keys.add(rec.pubkey);
      }
    }
  }
  return [...keys];
}

function usdcAmountToRecipient(ev: HeliusEvent, recipient: string): number {
  let total = 0;
  for (const t of ev.tokenTransfers || []) {
    const mint = t.mint || t.tokenAddress;
    const to = t.toUserAccount || t.to;
    if (mint !== USDC_MINT) continue;
    if (recipient && to && to !== recipient) continue;
    const amt = Number(t.tokenAmount ?? t.amount ?? 0);
    if (Number.isFinite(amt) && amt > 0) total += amt;
  }
  if (total > 0) return total;
  const delta = usdcDeltaToOwner(
    { meta: { preTokenBalances: ev.meta?.preTokenBalances, postTokenBalances: ev.meta?.postTokenBalances } },
    recipient,
  );
  return Number(delta) / 1e6;
}

/** Helius enhanced + raw webhook → candidate payments keyed by reference accounts. */
export function paymentsFromHeliusPayload(body: unknown, recipient: string): HeliusPayment[] {
  const events = normalizeHeliusEvents(body);
  const out: HeliusPayment[] = [];
  for (const ev of events) {
    const signature = ev.signature || ev.transactionSignature || "";
    const references = collectAccountKeys(ev);
    const amountUsdc = usdcAmountToRecipient(ev, recipient);
    if (!signature || amountUsdc <= 0) continue;
    out.push({ signature, amountUsdc, references });
  }
  return out;
}

export type InvoiceRow = {
  id: string;
  plan: string;
  email?: string | null;
  guest_email?: string | null;
  reference: string;
  recipient?: string | null;
  status: string;
  signature?: string | null;
  created_at?: string;
  expires_at: string;
  amount_usdc?: number;
};

export type InvoiceView = {
  id: string;
  plan: PaidPlanId;
  asset: "usdc";
  chain: "solana";
  amount_usdc: number;
  amount_base_units: string;
  exact_amount: string;
  recipient: string;
  reference: string;
  email: string | null;
  status: PayStatus;
  signature: string | null;
  pay_url: string;
  phantom_url: string;
  human_url: string;
  copy: PayCopy;
  created_at?: string;
  expires_at: string;
  match: "solana-pay-reference";
  no_unique_amount: true;
};

export function invoiceOrigin(origin?: string | null): string {
  const base = String(origin || APP_ORIGIN).replace(/\/$/, "");
  return base || APP_ORIGIN;
}

export function humanPayUrl(invoiceId: string, origin?: string | null): string {
  return `${invoiceOrigin(origin)}/billing/pay?id=${encodeURIComponent(invoiceId)}`;
}

export function viewInvoice(row: InvoiceRow, origin?: string | null): InvoiceView {
  const planId = parsePaidPlan(row.plan);
  const plan = PLANS[planId];
  const copy = copyFor(plan.price);
  const recipient = SOLANA_PAYOUT_ADDRESS;
  const payUrl = buildSolanaPayUrl({
    recipient,
    amountUsdc: plan.price,
    reference: row.reference,
    planName: plan.name,
  });
  const base = invoiceOrigin(origin);
  const email = row.email || row.guest_email || null;
  return {
    id: row.id,
    plan: planId,
    asset: "usdc",
    chain: "solana",
    amount_usdc: plan.price,
    amount_base_units: usdcBaseUnits(plan.price),
    exact_amount: String(plan.price),
    recipient,
    reference: row.reference,
    email,
    status: (row.status as PayStatus) || "pending",
    signature: row.signature || null,
    pay_url: payUrl,
    phantom_url: phantomBrowseUrl(payUrl),
    human_url: humanPayUrl(row.id, base),
    copy,
    created_at: row.created_at,
    expires_at: row.expires_at,
    match: "solana-pay-reference",
    no_unique_amount: true,
  };
}

export function planNameFor(plan: string): string {
  const id: PlanId = plan in PLANS ? (plan as PlanId) : "starter";
  return PLANS[id].name;
}

export { PAY_EXPIRY_MS, USDC_MINT, usdcBaseUnits };
