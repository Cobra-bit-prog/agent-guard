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
  formatUsdcExact,
  usdcBaseUnits,
  type PayChain,
  type PayRequestView,
  type PayStatus,
} from "@/lib/solana-pay";
import {
  findMatchingUsdcPayment,
  newPayReference,
  payoutAddress,
} from "@/lib/solana-pay.server";
import {
  allocateUniqueUsdcAmount,
  evmPayoutAddress,
  findMatchingEvmUsdcPayment,
} from "@/lib/evm-pay.server";
import { buildEip681TransferUrl, buildMetamaskSendUrl, type EvmPayChain } from "@/lib/evm-pay";
import { sendInvoiceEmail } from "@/lib/auth/send-email.server";
import { ensureSchema } from "@/lib/server/guard";

const PaidPlan = z.enum(["starter", "pro", "team"]);
const PayChainZ = z.enum(["solana", "ethereum", "base"]);

const CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

type PayRow = {
  id: string;
  plan: string;
  chain: string | null;
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
};

function truncRecipient(value: string) {
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function asPayChain(value: string | null | undefined): PayChain {
  if (value === "ethereum" || value === "base" || value === "solana") return value;
  return "solana";
}

function view(row: PayRow): PayRequestView {
  const planName = PLANS[(row.plan as PlanId) in PLANS ? (row.plan as PlanId) : "starter"].name;
  const chain = asPayChain(row.chain);
  const amountBaseUnits = String(row.amount_base_units ?? usdcBaseUnits(Number(row.amount_usdc)));
  const amountUsdc = Number(row.amount_usdc);
  const isEvm = chain === "ethereum" || chain === "base";
  return {
    id: row.id,
    plan: row.plan,
    chain,
    amountUsdc,
    amountBaseUnits,
    exactAmountUsdc: formatUsdcExact(amountBaseUnits),
    reference: row.reference,
    recipient: row.recipient,
    status: row.status as PayStatus,
    signature: row.signature,
    paidAmountUsdc: row.paid_amount_usdc == null ? null : Number(row.paid_amount_usdc),
    expiresAt: row.expires_at,
    payUrl: isEvm
      ? buildEip681TransferUrl({
          chain,
          recipient: row.recipient,
          amountBaseUnits,
        })
      : buildSolanaPayUrl({
          recipient: row.recipient,
          amountUsdc,
          reference: row.reference,
          planName,
        }),
    metamaskUrl: isEvm
      ? buildMetamaskSendUrl({
          chain,
          recipient: row.recipient,
          amountBaseUnits,
        })
      : null,
    checkoutConfigured: true,
  };
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
    if (!to) return;
    const chain = asPayChain(row.chain);
    const planName = PLANS[(row.plan as PlanId) in PLANS ? (row.plan as PlanId) : "starter"].name;
    const amountUsdc = formatUsdcExact(String(row.amount_base_units ?? usdcBaseUnits(Number(row.amount_usdc))));
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
      configured: solana || evm,
      recipient: solanaRecipient ? truncRecipient(solanaRecipient) : null,
      evmRecipient: evmRecipient ? truncRecipient(evmRecipient) : null,
    };
  });

export const createPayRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z.object({ plan: PaidPlan, chain: PayChainZ.default("solana") }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const chain = data.chain as PayChain;
    const plan = PLANS[data.plan];
    const sql = await getSql();
    const id = uid();
    const expires = new Date(Date.now() + PAY_EXPIRY_MS).toISOString();

    let recipient: string;
    let reference: string;
    let amountBase: string;

    if (chain === "solana") {
      const addr = payoutAddress();
      if (!addr) {
        throw new Error("Checkout is not configured for Solana.");
      }
      recipient = addr;
      reference = newPayReference();
      amountBase = usdcBaseUnits(plan.price);
    } else {
      const addr = evmPayoutAddress();
      if (!addr) {
        throw new Error(`Checkout is not configured for ${CHAIN_LABEL[chain]}.`);
      }
      recipient = addr;
      reference = `evm:${chain}:${uid()}`;
      const cutoff = new Date(Date.now() - PAY_EXPIRY_MS - 15 * 60 * 1000).toISOString();
      const used = await sql<{ amount_base_units: string }>`
        select amount_base_units from pay_requests
        where chain = ${chain}
          and (
            (status in (${"pending"}, ${"underpaid"}) and expires_at > ${new Date().toISOString()})
            or created_at > ${cutoff}
          )
      `;
      amountBase = await allocateUniqueUsdcAmount(
        used.map((r) => r.amount_base_units),
        plan.price,
      );
    }

    await sql`
      insert into pay_requests (
        id, user_id, plan, chain, amount_usdc, amount_base_units, reference, recipient,
        status, expires_at
      ) values (
        ${id}, ${context.userId}, ${data.plan}, ${chain}, ${plan.price}, ${amountBase},
        ${reference}, ${recipient}, ${"pending"}, ${expires}
      )
    `;
    const rows = await sql<PayRow>`
      select id, plan, chain, amount_usdc, amount_base_units, reference, recipient, status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at
      from pay_requests where id = ${id} and user_id = ${context.userId}
    `;
    return view(rows[0]);
  });

export const getPayRequest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql<PayRow>`
      select id, plan, chain, amount_usdc, amount_base_units, reference, recipient, status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at
      from pay_requests where id = ${data.id} and user_id = ${context.userId}
    `;
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
    const rows = await sql<PayRow>`
      select id, plan, chain, amount_usdc, amount_base_units, reference, recipient, status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at
      from pay_requests where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Pay request not found.");

    if (row.status === "paid") {
      await sendInvoiceIfNeeded(context.userId, row);
      return view(row);
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      if (row.status === "pending" || row.status === "underpaid") {
        await sql`update pay_requests set status = ${"expired"} where id = ${row.id}`;
        row.status = "expired";
      }
      return view(row);
    }

    const chain = asPayChain(row.chain);
    const match =
      chain === "solana"
        ? await findMatchingUsdcPayment({
            reference: row.reference,
            recipient: row.recipient,
            amountUsdc: Number(row.amount_usdc),
          })
        : await findMatchingEvmUsdcPayment({
            chain: chain as EvmPayChain,
            recipient: row.recipient,
            amountBaseUnits: String(row.amount_base_units),
            createdAt: row.created_at,
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
      await applyPaidPlan(context.userId, row.plan as "starter" | "pro" | "team", chain);
      row.status = "paid";
      row.signature = match.signature;
      row.paid_amount_usdc = match.amountUsdc;
      row.paid_at = new Date().toISOString();
      await sendInvoiceIfNeeded(context.userId, row);
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
