import { getSql } from "@/lib/db";
import { evaluateEntitlement, PLANS } from "@/lib/plans";
import { uid } from "@/lib/utils";
import { PAY_EXPIRY_MS, usdcBaseUnits, type PayChain } from "@/lib/solana-pay";
import { newPayReference, payoutAddress } from "@/lib/solana-pay.server";
import { allocateUniqueUsdcAmount, evmPayoutAddress } from "@/lib/evm-pay.server";
import { allocateUniqueNativeAmount, quoteSolEthUsd } from "@/lib/native-pay.server";
import { ensureSchema } from "@/lib/server/guard";
import {
  CheckoutNotConfiguredError,
  getPricing,
  runCreateCheckout,
  runGetStatus,
  runStartTrialOrAttach,
  type CheckoutPayRequest,
  type ResolvedCheckout,
  type StorefrontAgent,
  type StorefrontPrincipal,
} from "@/lib/storefront";

const CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

function asAgent(row: { id: string; user_id: string }): StorefrontAgent {
  return { id: String(row.id), userId: String(row.user_id) };
}

async function lookupAgentByApiKey(apiKey: string): Promise<StorefrontAgent | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string }>`
    select id, user_id from agents where api_key = ${apiKey} limit 1
  `;
  const row = rows[0];
  return row ? asAgent(row) : null;
}

async function entitlementForUser(userId: string) {
  const sql = await getSql();
  const rows = await sql<{
    plan: string;
    status: string;
    trial_ends_at: string | null;
    period_ends_at: string | null;
  }>`
    select plan, status, trial_ends_at, period_ends_at from subscriptions where user_id = ${userId}
  `;
  return evaluateEntitlement(rows[0] ?? { plan: "free", trial_ends_at: null });
}

async function lookupPrincipalById(userId: string): Promise<StorefrontPrincipal | null> {
  const sql = await getSql();
  let email: string | null = null;
  try {
    const users = await sql<{ email: string | null }>`
      select email from "user" where id = ${userId} limit 1
    `;
    if (!users[0]) return null;
    const value = users[0].email?.trim();
    email = value ? value.toLowerCase() : null;
  } catch (err) {
    console.error("[storefront] user lookup failed", err);
    return null;
  }
  return {
    userId,
    email,
    entitlement: await entitlementForUser(userId),
  };
}

async function lookupPrincipalByEmail(email: string): Promise<StorefrontPrincipal | null> {
  const sql = await getSql();
  try {
    const users = await sql<{ id: string; email: string | null }>`
      select id, email from "user" where lower(email) = ${email} limit 1
    `;
    const row = users[0];
    if (!row) return null;
    return {
      userId: String(row.id),
      email: row.email?.trim().toLowerCase() ?? email,
      entitlement: await entitlementForUser(String(row.id)),
    };
  } catch (err) {
    console.error("[storefront] email lookup failed", err);
    return null;
  }
}

function asCheckoutRow(row: {
  id: string;
  user_id: string;
  plan: string;
  asset: string | null;
  chain: string | null;
  amount_usdc: number;
  amount_base_units: string;
  recipient: string;
  reference: string;
  expires_at: string;
  status: string;
}): CheckoutPayRequest {
  return {
    id: row.id,
    user_id: String(row.user_id),
    plan: row.plan,
    asset: String(row.asset ?? "usdc"),
    chain: String(row.chain ?? "solana"),
    amount_usdc: Number(row.amount_usdc),
    amount_base_units: String(row.amount_base_units),
    recipient: row.recipient,
    reference: row.reference,
    expires_at: row.expires_at,
    status: row.status,
  };
}

async function findOpenPayRequest(
  key: ResolvedCheckout & { userId: string },
): Promise<CheckoutPayRequest | null> {
  const sql = await getSql();
  const now = new Date().toISOString();
  const rows = await sql<{
    id: string;
    user_id: string;
    plan: string;
    asset: string | null;
    chain: string | null;
    amount_usdc: number;
    amount_base_units: string;
    recipient: string;
    reference: string;
    expires_at: string;
    status: string;
  }>`
    select id, user_id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient,
           status, expires_at
    from pay_requests
    where user_id = ${key.userId}
      and plan = ${key.plan}
      and asset = ${key.asset}
      and chain = ${key.chain}
      and status in (${"pending"}, ${"underpaid"})
      and expires_at > ${now}
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  return row ? asCheckoutRow(row) : null;
}

/** Server-only insert. Credits `userId` (the human principal), never an agent row. */
async function createPayRequestForPrincipal(
  userId: string,
  input: ResolvedCheckout,
): Promise<CheckoutPayRequest> {
  const plan = PLANS[input.plan];
  const sql = await getSql();
  const id = uid();
  const expires = new Date(Date.now() + PAY_EXPIRY_MS).toISOString();
  const { asset, chain } = input;

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
    if (!addr) throw new CheckoutNotConfiguredError("Checkout is not configured for Solana.");
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
      ${id}, ${userId}, ${input.plan}, ${chain}, ${asset}, ${plan.price}, ${amountBase},
      ${reference}, ${recipient}, ${"pending"}, ${expires}
    )
  `;
  const rows = await sql<{
    id: string;
    user_id: string;
    plan: string;
    asset: string | null;
    chain: string | null;
    amount_usdc: number;
    amount_base_units: string;
    recipient: string;
    reference: string;
    expires_at: string;
    status: string;
  }>`
    select id, user_id, plan, chain, asset, amount_usdc, amount_base_units, reference, recipient,
           status, expires_at
    from pay_requests where id = ${id} and user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Could not start checkout.");
  return asCheckoutRow(row);
}

export async function storefrontStartTrial(input: { apiKey: string; body: unknown }) {
  await ensureSchema();
  return runStartTrialOrAttach(input, {
    lookupAgentByApiKey,
    lookupPrincipalByEmail,
    lookupPrincipalById,
  });
}

export async function storefrontGetStatus(apiKey: string) {
  await ensureSchema();
  return runGetStatus(apiKey, {
    lookupAgentByApiKey,
    lookupPrincipal: lookupPrincipalById,
  });
}

export async function storefrontCreateCheckout(input: { apiKey: string; body: unknown }) {
  await ensureSchema();
  return runCreateCheckout(input, {
    lookupAgentByApiKey,
    findOpenPayRequest,
    createPayRequest: createPayRequestForPrincipal,
  });
}

export async function dispatchStorefrontTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
) {
  if (name === "get_pricing") return { ok: true as const, result: getPricing() };
  if (name === "start_trial" || name === "attach_human") {
    return storefrontStartTrial({ apiKey, body: args });
  }
  if (name === "create_checkout") return storefrontCreateCheckout({ apiKey, body: args });
  if (name === "get_status") return storefrontGetStatus(apiKey);
  return null;
}
