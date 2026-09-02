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
import { findMatchingUsdcPayment, newPayReference, payoutAddress } from "@/lib/solana-pay.server";
import {
  allocateUniqueUsdcAmount,
  evmPayoutAddress,
  findMatchingEvmUsdcPayment,
} from "@/lib/evm-pay.server";
import { buildEip681TransferUrl, buildMetamaskSendUrl, type EvmPayChain } from "@/lib/evm-pay";
import {
  PAY_ASSET_DECIMALS,
  PAY_ASSET_LABEL,
  asPayAsset,
  buildNativeEthMetamaskUrl,
  buildNativeEthPayUrl,
  buildNativeSolanaPayUrl,
  formatExactAmount,
  type PayAsset,
} from "@/lib/pay-asset";
import {
  allocateUniqueNativeAmount,
  findMatchingNativeEthPayment,
  findMatchingNativeSolPayment,
  quoteSolEthUsd,
} from "@/lib/native-pay.server";
import { sendInvoiceEmail, sendNewSubscriberNotifyEmail } from "@/lib/auth/send-email.server";
import { ensureSchema } from "@/lib/server/guard";
import { rpc, solanaRpcUrls } from "@/lib/onchain";
import {
  CheckoutNotConfiguredError,
  PAID_PLANS,
  PAY_ASSETS,
  PAY_CHAINS,
  resolveCheckoutInput,
  type PaidPlanId,
} from "@/lib/agent-checkout";

const PaidPlan = z.enum(PAID_PLANS);
const PayChainZ = z.enum(PAY_CHAINS);
const PayAssetZ = z.enum(PAY_ASSETS);

const CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

type PayRow = {
  id: string;
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
  const asset = asPayAsset(row.asset);
  const amountBaseUnits = String(row.amount_base_units ?? usdcBaseUnits(Number(row.amount_usdc)));
  const amountUsdc = Number(row.amount_usdc);
  const symbol = PAY_ASSET_LABEL[asset];
  const decimals = PAY_ASSET_DECIMALS[asset];
  const exactAmount =
    asset === "usdc"
      ? formatUsdcExact(amountBaseUnits)
      : formatExactAmount(amountBaseUnits, decimals);
  const isEvmUsdc = asset === "usdc" && (chain === "ethereum" || chain === "base");
  let payUrl = "";
  let metamaskUrl: string | null = null;
  if (asset === "sol") {
    payUrl = buildNativeSolanaPayUrl({
      recipient: row.recipient,
      amountSol: exactAmount,
      reference: row.reference,
      planName,
    });
  } else if (asset === "eth") {
    payUrl = buildNativeEthPayUrl(row.recipient, amountBaseUnits);
    metamaskUrl = buildNativeEthMetamaskUrl(row.recipient, amountBaseUnits);
  } else if (isEvmUsdc) {
    payUrl = buildEip681TransferUrl({
      chain,
      recipient: row.recipient,
      amountBaseUnits,
    });
    metamaskUrl = buildMetamaskSendUrl({
      chain,
      recipient: row.recipient,
      amountBaseUnits,
    });
  } else {
    payUrl = buildSolanaPayUrl({
      recipient: row.recipient,
      amountUsdc,
      reference: row.reference,
      planName,
    });
  }
  return {
    id: row.id,
    plan: row.plan,
    chain,
    asset,
    symbol,
    amountUsdc,
    amountBaseUnits,
    exactAmountUsdc: exactAmount,
    exactAmount,
    reference: row.reference,
    recipient: row.recipient,
    status: row.status as PayStatus,
    signature: row.signature,
    paidAmountUsdc: row.paid_amount_usdc == null ? null : Number(row.paid_amount_usdc),
    expiresAt: row.expires_at,
    payUrl,
    metamaskUrl,
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

/** Shared insert used by human Billing and agent REST checkout. */
export async function createPayRequestForUser(
  userId: string,
  data: { plan: PaidPlanId; asset?: PayAsset; chain?: PayChain },
): Promise<PayRequestView> {
  const { plan: planId, asset, chain } = resolveCheckoutInput(data);
  const plan = PLANS[planId];
  const sql = await getSql();
  const id = uid();
  const expires = new Date(Date.now() + PAY_EXPIRY_MS).toISOString();

  let recipient: string;
  let reference: string;
  let amountBase: string;

  if (asset === "sol") {
    const addr = payoutAddress();
    if (!addr) throw new CheckoutNotConfiguredError("Checkout is not configured for Solana.");
    recipient = addr;
    reference = newPayReference();
    const quote = await quoteSolEthUsd();
    const cutoff = new Date(Date.now() - PAY_EXPIRY_MS - 15 * 60 * 1000).toISOString();
    const used = await sql<{ amount_base_units: string }>`
      select amount_base_units from pay_requests
      where asset = ${"sol"}
        and (
          (status in (${"pending"}, ${"underpaid"}) and expires_at > ${new Date().toISOString()})
          or created_at > ${cutoff}
        )
    `;
    amountBase = allocateUniqueNativeAmount(
      used.map((r) => r.amount_base_units),
      plan.price,
      quote.sol,
      9,
    );
  } else if (asset === "eth") {
    const addr = evmPayoutAddress();
    if (!addr) throw new CheckoutNotConfiguredError("Checkout is not configured for Ethereum.");
    recipient = addr;
    reference = `eth:${uid()}`;
    const quote = await quoteSolEthUsd();
    const cutoff = new Date(Date.now() - PAY_EXPIRY_MS - 15 * 60 * 1000).toISOString();
    const used = await sql<{ amount_base_units: string }>`
      select amount_base_units from pay_requests
      where asset = ${"eth"}
        and (
          (status in (${"pending"}, ${"underpaid"}) and expires_at > ${new Date().toISOString()})
          or created_at > ${cutoff}
        )
    `;
    amountBase = allocateUniqueNativeAmount(
      used.map((r) => r.amount_base_units),
      plan.price,
      quote.eth,
      18,
    );
  } else if (chain === "solana") {
    const addr = payoutAddress();
    if (!addr) {
      throw new CheckoutNotConfiguredError("Checkout is not configured for Solana.");
    }
    recipient = addr;
    reference = newPayReference();
    amountBase = usdcBaseUnits(plan.price);
  } else {
    const addr = evmPayoutAddress();
    if (!addr) {
      throw new CheckoutNotConfiguredError(`Checkout is not configured for ${CHAIN_LABEL[chain]}.`);
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
      id, user_id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient,
      status, expires_at
    ) values (
      ${id}, ${userId}, ${planId}, ${chain}, ${asset}, ${plan.price}, ${amountBase},
      ${reference}, ${recipient}, ${"pending"}, ${expires}
    )
  `;
  const rows = await sql<PayRow>`
    select id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient, status, signature, paid_amount_usdc, expires_at, created_at, paid_at, invoice_email_sent_at
    from pay_requests where id = ${id} and user_id = ${userId}
  `;
  return view(rows[0]);
}

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
    return view(row);
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
