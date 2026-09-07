import { getSql } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { uid } from "@/lib/utils";
import { PAY_EXPIRY_MS, PERIOD_DAYS, usdcBaseUnits, type PayChain } from "@/lib/solana-pay";
import { findMatchingUsdcPayment, newPayReference, payoutAddress } from "@/lib/solana-pay.server";
import {
  guestUserId,
  isGuestUserId,
  parseEmail,
  parsePaidPlan,
  paymentsFromHeliusPayload,
  viewInvoice,
  type InvoiceView,
  type PaidPlanId,
} from "@/lib/pay-invoice";
import { sendInvoiceEmail, sendNewSubscriberNotifyEmail } from "@/lib/auth/send-email.server";
import { ensureSchema } from "@/lib/server/guard";
import { PAY_ASSET_DECIMALS, PAY_ASSET_LABEL, asPayAsset, formatExactAmount } from "@/lib/pay-asset";

const CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

export type PayRow = {
  id: string;
  user_id: string;
  plan: string;
  chain: string | null;
  asset: string | null;
  amount_usdc: number;
  amount_base_units: string;
  reference: string;
  recipient: string;
  status: string;
  signature: string | null;
  paid_amount_usdc: number | null;
  expires_at: string;
  created_at?: string;
  paid_at?: string | null;
  invoice_email_sent_at?: string | null;
  guest_email?: string | null;
  source?: string | null;
};

const PAY_SELECT = `
  id, user_id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient,
  status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at,
  guest_email, source
`;

export function asPayChain(value: string | null | undefined): PayChain {
  if (value === "ethereum" || value === "base" || value === "solana") return value;
  return "solana";
}

/** Solana USDC invoices (human or agent). SOL/ETH stay on the logged-in PayPanel. */
export function isHumanUsdcInvoice(row: PayRow): boolean {
  const asset = String(row.asset || "usdc").toLowerCase();
  const chain = String(row.chain || "solana").toLowerCase();
  return asset === "usdc" && chain === "solana";
}

export async function setInvoiceEmail(id: string, email: string): Promise<PayRow | null> {
  const parsed = parseEmail(email);
  if (!parsed) throw new Error("Enter a valid email.");
  const row = await getInvoiceRow(id);
  if (!row) return null;
  const sql = await getSql();
  await sql`update pay_requests set guest_email = ${parsed} where id = ${row.id}`;
  row.guest_email = parsed;
  return row;
}

export async function lookupUserEmail(userId: string): Promise<string | null> {
  if (isGuestUserId(userId)) return null;
  try {
    const sql = await getSql();
    const rows = await sql<{ email: string }>`
      select email from "user" where id = ${userId} limit 1
    `;
    const email = rows[0]?.email?.trim();
    return email || null;
  } catch (err) {
    console.error("[billing] user email lookup failed", err);
    return null;
  }
}

export async function lookupUserIdByEmail(email: string): Promise<string | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from "user" where lower(email) = ${email} limit 1
    `;
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[billing] user id lookup failed", err);
    return null;
  }
}

export async function applyPaidPlan(
  userId: string,
  plan: PaidPlanId,
  chain: PayChain = "solana",
): Promise<void> {
  if (isGuestUserId(userId)) return;
  const sql = await getSql();
  const period = new Date(Date.now() + PERIOD_DAYS * 86400000).toISOString();
  await sql`
    insert into subscriptions (user_id, plan, status, trial_ends_at, period_ends_at, updated_at)
    values (${userId}, ${plan}, ${"active"}, ${null}, ${period}, ${new Date().toISOString()})
    on conflict (user_id) do update
      set plan = ${plan},
          status = ${"active"},
          trial_ends_at = ${null},
          period_ends_at = ${period},
          updated_at = ${new Date().toISOString()}
  `;
  await sql`update agents set is_paused = false where user_id = ${userId}`;
  await sql`
    insert into audit_events (id, user_id, agent_id, action, detail)
    values (
      ${uid()}, ${userId}, ${null}, ${"plan_paid"},
      ${`Received ${PLANS[plan].price} USDC on ${CHAIN_LABEL[chain]}. ${PLANS[plan].name} active for ${PERIOD_DAYS} days.`}
    )
  `;
}

/** Paid only. Missing Resend key skips. Never throws — unlock already happened. */
export async function sendInvoiceIfNeeded(userId: string, row: PayRow): Promise<void> {
  if (row.status !== "paid") return;
  if (row.invoice_email_sent_at) return;
  try {
    const to = (await lookupUserEmail(userId)) || parseEmail(row.guest_email);
    if (!to) {
      console.error("[billing] invoice email skipped: no email for user");
      return;
    }
    const chain = asPayChain(row.chain);
    const planName = PLANS[(row.plan as PlanId) in PLANS ? (row.plan as PlanId) : "starter"].name;
    const asset = asPayAsset(row.asset);
    const amountUsdc = `${formatExactAmount(
      String(row.amount_base_units ?? usdcBaseUnits(Number(row.amount_usdc))),
      PAY_ASSET_DECIMALS[asset],
    )} ${PAY_ASSET_LABEL[asset]}`;
    const sent = await sendInvoiceEmail({
      to,
      invoiceId: row.id,
      date: row.paid_at || new Date().toISOString(),
      planName,
      amountUsdc,
      chain: CHAIN_LABEL[chain],
    });
    if (!sent) return;
    const sql = await getSql();
    const now = new Date().toISOString();
    await sql`
      update pay_requests
      set invoice_email_sent_at = ${now}
      where id = ${row.id} and invoice_email_sent_at is null
    `;
    row.invoice_email_sent_at = now;
  } catch (err) {
    console.error("[billing] invoice email failed", err);
  }
}

export async function markInvoicePaid(
  row: PayRow,
  match: { signature: string; amountUsdc: number },
): Promise<PayRow> {
  if (row.status === "paid") return row;
  const sql = await getSql();
  const paidAt = new Date().toISOString();
  const chain = asPayChain(row.chain);
  let userId = row.user_id;
  if (isGuestUserId(userId) && row.guest_email) {
    const found = await lookupUserIdByEmail(row.guest_email);
    if (found) userId = found;
  }
  await sql`
    update pay_requests
    set status = ${"paid"},
        signature = ${match.signature},
        paid_amount_usdc = ${match.amountUsdc},
        paid_at = ${paidAt},
        user_id = ${userId}
    where id = ${row.id}
  `;
  row.status = "paid";
  row.signature = match.signature;
  row.paid_amount_usdc = match.amountUsdc;
  row.paid_at = paidAt;
  row.user_id = userId;
  const plan = parsePaidPlan(row.plan);
  if (!isGuestUserId(userId)) {
    await applyPaidPlan(userId, plan, chain);
    const planName = PLANS[plan].name;
    await sendNewSubscriberNotifyEmail({
      kind: "paid",
      planName,
      at: paidAt,
      userEmail: (await lookupUserEmail(userId)) || row.guest_email,
      payRequestId: row.id,
      chain: CHAIN_LABEL[chain],
    });
    await sendInvoiceIfNeeded(userId, row);
  }
  return row;
}

async function expireIfNeeded(row: PayRow): Promise<PayRow> {
  if (row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now()) {
    const sql = await getSql();
    await sql`update pay_requests set status = ${"expired"} where id = ${row.id}`;
    row.status = "expired";
  }
  return row;
}

export async function getInvoiceRow(idOrRef: string): Promise<PayRow | null> {
  await ensureSchema();
  const sql = await getSql();
  const key = idOrRef.trim();
  if (!key) return null;
  const found = await sql.query<PayRow>(
    `select ${PAY_SELECT} from pay_requests
     where id = $1 or reference = $1
     order by created_at desc
     limit 1`,
    [key],
  );
  const row = found[0];
  if (!row) return null;
  return expireIfNeeded(row);
}

export async function findInvoiceByReference(reference: string): Promise<PayRow | null> {
  await ensureSchema();
  const sql = await getSql();
  const key = reference.trim();
  if (!key) return null;
  const rows = await sql.query<PayRow>(
    `select ${PAY_SELECT} from pay_requests where reference = $1 limit 1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function createUsdcInvoice(opts: {
  plan?: unknown;
  email?: string | null;
  userId?: string | null;
  source?: string;
}): Promise<PayRow> {
  await ensureSchema();
  const planId = parsePaidPlan(opts.plan);
  const plan = PLANS[planId];
  const email = parseEmail(opts.email);
  const sql = await getSql();
  const recipient = payoutAddress();
  const now = new Date().toISOString();

  let userId = opts.userId?.trim() || "";
  if (!userId && email) {
    userId = (await lookupUserIdByEmail(email)) ?? "";
  }

  if (userId && !isGuestUserId(userId)) {
    const open = await sql.query<PayRow>(
      `select ${PAY_SELECT} from pay_requests
       where user_id = $1 and plan = $2 and asset = 'usdc' and chain = 'solana'
         and status in ('pending', 'underpaid') and expires_at > $3
       order by created_at desc limit 1`,
      [userId, planId, now],
    );
    if (open[0]) return open[0];
  } else if (email) {
    const open = await sql.query<PayRow>(
      `select ${PAY_SELECT} from pay_requests
       where guest_email = $1 and plan = $2 and asset = 'usdc' and chain = 'solana'
         and status in ('pending', 'underpaid') and expires_at > $3
       order by created_at desc limit 1`,
      [email, planId, now],
    );
    if (open[0]) return open[0];
  }

  const id = uid();
  if (!userId) userId = guestUserId(id);
  const reference = newPayReference();
  const amountBase = usdcBaseUnits(plan.price);
  const expires = new Date(Date.now() + PAY_EXPIRY_MS).toISOString();
  const source = opts.source || "human";

  await sql.query(
    `insert into pay_requests (
      id, user_id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient,
      status, expires_at, guest_email, source
    ) values ($1,$2,$3,'solana','usdc',$4,$5,$6,$7,'pending',$8,$9,$10)`,
    [id, userId, planId, plan.price, amountBase, reference, recipient, expires, email, source],
  );
  const rows = await sql.query<PayRow>(
    `select ${PAY_SELECT} from pay_requests where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error("Could not create invoice.");
  return row;
}

export async function watchUsdcInvoice(row: PayRow): Promise<PayRow> {
  await expireIfNeeded(row);
  if (row.status === "paid") {
    if (!isGuestUserId(row.user_id)) await sendInvoiceIfNeeded(row.user_id, row);
    return row;
  }
  if (row.status === "expired") return row;

  let match: Awaited<ReturnType<typeof findMatchingUsdcPayment>> = { kind: "none" };
  try {
    match = await findMatchingUsdcPayment({
      reference: row.reference,
      recipient: payoutAddress(),
      amountUsdc: Number(row.amount_usdc),
    });
  } catch (err) {
    console.error("[billing] watch match failed", err);
    match = { kind: "none" };
  }
  if (match.kind === "paid") {
    return markInvoicePaid(row, match);
  }
  if (match.kind === "underpaid") {
    const sql = await getSql();
    await sql`
      update pay_requests
      set signature = ${match.signature},
          paid_amount_usdc = ${match.amountUsdc}
      where id = ${row.id} and status = ${"pending"}
    `;
    row.signature = match.signature;
    row.paid_amount_usdc = match.amountUsdc;
    row.status = "underpaid";
  }
  return row;
}

export async function applyHeliusPayload(body: unknown): Promise<Array<{ id: string; signature: string }>> {
  await ensureSchema();
  const recipient = payoutAddress();
  const payments = paymentsFromHeliusPayload(body, recipient);
  const paid: Array<{ id: string; signature: string }> = [];
  for (const pay of payments) {
    for (const key of pay.references) {
      const row = await findInvoiceByReference(key);
      if (!row || row.status === "paid") continue;
      if (!isHumanUsdcInvoice(row)) continue;
      const need = PLANS[parsePaidPlan(row.plan)].price;
      if (pay.amountUsdc + 1e-9 >= need) {
        const next = await markInvoicePaid(row, {
          signature: pay.signature,
          amountUsdc: pay.amountUsdc,
        });
        paid.push({ id: next.id, signature: pay.signature });
      }
    }
  }
  return paid;
}

/** Apply a paid guest invoice to a newly signed-up user with the same email. */
export async function claimPaidInvoicesForUser(userId: string, email: string | null): Promise<void> {
  const parsed = parseEmail(email);
  if (!parsed) return;
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query<PayRow>(
    `select ${PAY_SELECT} from pay_requests
     where status = 'paid'
       and guest_email = $1
       and (user_id like 'guest:%' or user_id = $2)
     order by paid_at desc nulls last`,
    [parsed, userId],
  );
  for (const row of rows) {
    await sql`update pay_requests set user_id = ${userId} where id = ${row.id}`;
    row.user_id = userId;
    await applyPaidPlan(userId, parsePaidPlan(row.plan), asPayChain(row.chain));
    await sendInvoiceIfNeeded(userId, row);
  }
}

export function invoiceView(row: PayRow, origin?: string | null): InvoiceView {
  return viewInvoice(
    {
      id: row.id,
      plan: row.plan,
      email: row.guest_email,
      guest_email: row.guest_email,
      reference: row.reference,
      recipient: payoutAddress(),
      status: row.status,
      signature: row.signature,
      created_at: row.created_at,
      expires_at: row.expires_at,
      amount_usdc: Number(row.amount_usdc),
    },
    origin,
  );
}

export function publicCheckoutConfig() {
  const addr = payoutAddress();
  return {
    configured: true,
    chain: "solana" as const,
    asset: "usdc" as const,
    match: "solana-pay-reference" as const,
    no_unique_amount: true as const,
    recipient: addr,
    helius: Boolean(process.env.HELIUS_API_KEY?.trim()),
    note: "Recipient is hard-locked to Vercel Production SOLANA_PAYOUT_ADDRESS.",
  };
}
