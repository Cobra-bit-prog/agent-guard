import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { uid } from "@/lib/utils";
import { PERIOD_DAYS, usdcBaseUnits, type PayChain } from "@/lib/solana-pay";
import { findMatchingUsdcPayment, payoutAddress } from "@/lib/solana-pay.server";
import { evmPayoutAddress, findMatchingEvmUsdcPayment } from "@/lib/evm-pay.server";
import type { EvmPayChain } from "@/lib/evm-pay";
import {
  asPayAsset,
  PAY_ASSET_DECIMALS,
  PAY_ASSET_LABEL,
  formatExactAmount,
} from "@/lib/pay-asset";
import {
  findMatchingNativeEthPayment,
  findMatchingNativeSolPayment,
} from "@/lib/native-pay.server";
import { sendInvoiceEmail, sendNewSubscriberNotifyEmail } from "@/lib/auth/send-email.server";
import { ensureSchema } from "@/lib/server/guard";
import { rpc, solanaRpcUrls } from "@/lib/onchain";
import { PAID_PLANS, PAY_ASSETS, PAY_CHAINS } from "@/lib/agent-checkout";
import { createPayRequestForUser } from "@/lib/server/pay-request.server";
import { CHAIN_LABEL, asPayChain, viewPayRequest, type PayRow } from "@/lib/pay-request-view";

const PaidPlan = z.enum(PAID_PLANS);
const PayChainZ = z.enum(PAY_CHAINS);
const PayAssetZ = z.enum(PAY_ASSETS);

function truncRecipient(value: string) {
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function applyPaidPlan(userId: string, plan: "starter" | "pro" | "team", chain: PayChain) {
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

async function lookupUserEmail(userId: string): Promise<string | null> {
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

/** Paid only. Missing Resend key skips. Never throws — unlock already happened. */
async function sendInvoiceIfNeeded(userId: string, row: PayRow): Promise<void> {
  if (row.status !== "paid") return;
  if (row.invoice_email_sent_at) return;
  try {
    const to = await lookupUserEmail(userId);
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

export const getCheckoutConfig = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const solanaRecipient = payoutAddress();
    const evmRecipient = evmPayoutAddress();
    const solana = Boolean(solanaRecipient);
    const evm = Boolean(evmRecipient);
    return {
      solana,
      ethereum: evm,
      base: evm,
      usdc: solana,
      sol: solana,
      eth: evm,
      configured: solana || evm,
      recipient: solanaRecipient ? truncRecipient(solanaRecipient) : null,
      evmRecipient: evmRecipient ? truncRecipient(evmRecipient) : null,
    };
  });

export const createPayRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({ plan: PaidPlan, asset: PayAssetZ.default("usdc"), chain: PayChainZ.optional() })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureSchema();
    return await createPayRequestForUser(context.userId, data);
  });

export const getPayRequest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<PayRow>`
      select id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient, status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at
      from pay_requests where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Pay request not found.");
    if (row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now()) {
      await sql`update pay_requests set status = ${"expired"} where id = ${row.id}`;
      row.status = "expired";
    }
    if (row.status === "paid") await sendInvoiceIfNeeded(context.userId, row);
    return viewPayRequest(row);
  });

export const watchPayRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<PayRow>`
      select id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient, status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at
      from pay_requests where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Pay request not found.");

    if (row.status === "paid") {
      await sendInvoiceIfNeeded(context.userId, row);
      return viewPayRequest(row);
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      if (row.status === "pending" || row.status === "underpaid") {
        await sql`update pay_requests set status = ${"expired"} where id = ${row.id}`;
        row.status = "expired";
      }
      return viewPayRequest(row);
    }

    const chain = asPayChain(row.chain);
    const asset = asPayAsset(row.asset);
    let match:
      | { kind: "none" }
      | { kind: "paid"; signature: string; amountUsdc: number }
      | { kind: "underpaid"; signature: string; amountUsdc: number } = { kind: "none" };
    try {
      if (asset === "sol") {
        match = await findMatchingNativeSolPayment({
          recipient: row.recipient,
          amountBaseUnits: String(row.amount_base_units),
          reference: row.reference,
          planPriceUsdc: Number(row.amount_usdc),
        });
      } else if (asset === "eth") {
        match = await findMatchingNativeEthPayment({
          recipient: row.recipient,
          amountBaseUnits: String(row.amount_base_units),
          planPriceUsdc: Number(row.amount_usdc),
        });
      } else if (chain === "solana") {
        match = await findMatchingUsdcPayment({
          reference: row.reference,
          recipient: row.recipient,
          amountUsdc: Number(row.amount_usdc),
        });
      } else {
        match = await findMatchingEvmUsdcPayment({
          chain: chain as EvmPayChain,
          recipient: row.recipient,
          amountBaseUnits: String(row.amount_base_units),
          createdAt: row.created_at,
        });
      }
    } catch (err) {
      console.error("[billing] watch match failed", asset, chain, err);
      match = { kind: "none" };
    }
    if (match.kind === "paid") {
      const paidAt = new Date().toISOString();
      await sql`
        update pay_requests
        set status = ${"paid"},
            signature = ${match.signature},
            paid_amount_usdc = ${match.amountUsdc},
            paid_at = ${paidAt}
        where id = ${row.id}
      `;
      await applyPaidPlan(context.userId, row.plan as "starter" | "pro" | "team", chain);
      row.status = "paid";
      row.signature = match.signature;
      row.paid_amount_usdc = match.amountUsdc;
      row.paid_at = paidAt;
      const planName = PLANS[(row.plan as PlanId) in PLANS ? (row.plan as PlanId) : "starter"].name;
      await sendNewSubscriberNotifyEmail({
        kind: "paid",
        planName,
        at: paidAt,
        userEmail: await lookupUserEmail(context.userId),
        payRequestId: row.id,
        chain: CHAIN_LABEL[chain],
      });
      await sendInvoiceIfNeeded(context.userId, row);
      return viewPayRequest(row);
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
      return viewPayRequest(row);
    }
    return viewPayRequest(row);
  });

export const getSolanaBlockhash = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    let last: unknown;
    for (const url of solanaRpcUrls()) {
      try {
        const result = await rpc<{ value?: { blockhash?: string } }>(url, "getLatestBlockhash", [
          { commitment: "confirmed" },
        ]);
        const blockhash = result?.value?.blockhash;
        if (blockhash) return { blockhash };
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error("Could not fetch a Solana blockhash.");
  });
