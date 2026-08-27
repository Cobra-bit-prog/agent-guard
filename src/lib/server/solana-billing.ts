import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { uid } from "@/lib/utils";
import {
  PAY_EXPIRY_MS,
  PERIOD_DAYS,
  buildSolanaPayUrl,
  usdcBaseUnits,
  type PayRequestView,
  type PayStatus,
} from "@/lib/solana-pay";
import {
  checkoutConfigured,
  findMatchingUsdcPayment,
  newPayReference,
  payoutAddress,
} from "@/lib/solana-pay.server";
import { ensureSchema } from "@/lib/server/guard";

const PaidPlan = z.enum(["starter", "pro", "team"]);

function truncRecipient(value: string) {
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function view(row: {
  id: string;
  plan: string;
  amount_usdc: number;
  reference: string;
  recipient: string;
  status: string;
  signature: string | null;
  paid_amount_usdc: number | null;
  expires_at: string;
}): PayRequestView {
  const planName = PLANS[(row.plan as PlanId) in PLANS ? (row.plan as PlanId) : "starter"].name;
  return {
    id: row.id,
    plan: row.plan,
    amountUsdc: Number(row.amount_usdc),
    reference: row.reference,
    recipient: row.recipient,
    status: row.status as PayStatus,
    signature: row.signature,
    paidAmountUsdc: row.paid_amount_usdc == null ? null : Number(row.paid_amount_usdc),
    expiresAt: row.expires_at,
    payUrl: buildSolanaPayUrl({
      recipient: row.recipient,
      amountUsdc: Number(row.amount_usdc),
      reference: row.reference,
      planName,
    }),
    checkoutConfigured: true,
  };
}

async function applyPaidPlan(userId: string, plan: "starter" | "pro" | "team") {
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
      ${`Received ${PLANS[plan].price} USDC on Solana. ${PLANS[plan].name} active for ${PERIOD_DAYS} days.`}
    )
  `;
}

export const getCheckoutConfig = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const recipient = payoutAddress();
    return {
      configured: Boolean(recipient),
      recipient: recipient ? truncRecipient(recipient) : null,
    };
  });

export const createPayRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ plan: PaidPlan }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const recipient = payoutAddress();
    if (!recipient) {
      throw new Error("Checkout is not configured.");
    }
    const plan = PLANS[data.plan];
    const sql = await getSql();
    const id = uid();
    const reference = newPayReference();
    const expires = new Date(Date.now() + PAY_EXPIRY_MS).toISOString();
    await sql`
      insert into pay_requests (
        id, user_id, plan, amount_usdc, amount_base_units, reference, recipient,
        status, expires_at
      ) values (
        ${id}, ${context.userId}, ${data.plan}, ${plan.price}, ${usdcBaseUnits(plan.price)},
        ${reference}, ${recipient}, ${"pending"}, ${expires}
      )
    `;
    const rows = await sql<{
      id: string;
      plan: string;
      amount_usdc: number;
      reference: string;
      recipient: string;
      status: string;
      signature: string | null;
      paid_amount_usdc: number | null;
      expires_at: string;
    }>`select id, plan, amount_usdc, reference, recipient, status, signature, paid_amount_usdc, expires_at
       from pay_requests where id = ${id} and user_id = ${context.userId}`;
    return view(rows[0]);
  });

export const getPayRequest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      plan: string;
      amount_usdc: number;
      reference: string;
      recipient: string;
      status: string;
      signature: string | null;
      paid_amount_usdc: number | null;
      expires_at: string;
    }>`select id, plan, amount_usdc, reference, recipient, status, signature, paid_amount_usdc, expires_at
       from pay_requests where id = ${data.id} and user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) throw new Error("Pay request not found.");
    if (row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now()) {
      await sql`update pay_requests set status = ${"expired"} where id = ${row.id}`;
      row.status = "expired";
    }
    return view(row);
  });

export const watchPayRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      plan: string;
      amount_usdc: number;
      reference: string;
      recipient: string;
      status: string;
      signature: string | null;
      paid_amount_usdc: number | null;
      expires_at: string;
    }>`select id, plan, amount_usdc, reference, recipient, status, signature, paid_amount_usdc, expires_at
       from pay_requests where id = ${data.id} and user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) throw new Error("Pay request not found.");

    if (row.status === "paid") return view(row);
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      if (row.status === "pending" || row.status === "underpaid") {
        await sql`update pay_requests set status = ${"expired"} where id = ${row.id}`;
        row.status = "expired";
      }
      return view(row);
    }

    const match = await findMatchingUsdcPayment({
      reference: row.reference,
      recipient: row.recipient,
      amountUsdc: Number(row.amount_usdc),
    });
    if (match.kind === "paid") {
      await sql`
        update pay_requests
        set status = ${"paid"},
            signature = ${match.signature},
            paid_amount_usdc = ${match.amountUsdc},
            paid_at = ${new Date().toISOString()}
        where id = ${row.id}
      `;
      await applyPaidPlan(context.userId, row.plan as "starter" | "pro" | "team");
      row.status = "paid";
      row.signature = match.signature;
      row.paid_amount_usdc = match.amountUsdc;
      return view(row);
    }
    if (match.kind === "underpaid") {
      await sql`
        update pay_requests
        set signature = ${match.signature},
            paid_amount_usdc = ${match.amountUsdc}
        where id = ${row.id} and status = ${"pending"}
      `;
      row.signature = match.signature;
      row.paid_amount_usdc = match.amountUsdc;
      row.status = "underpaid";
      return view(row);
    }
    return view(row);
  });
