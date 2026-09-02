import {
  runAgentCheckout,
  type CheckoutPayRequest,
  type ResolvedCheckout,
} from "@/lib/agent-checkout";
import { getSql } from "@/lib/db";
import { ensureSchema } from "@/lib/server/guard";
import { createPayRequestForUser } from "@/lib/server/pay-request.server";

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

async function lookupAgentByApiKey(apiKey: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string }>`
    select id, user_id from agents where api_key = ${apiKey} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: String(row.id), user_id: String(row.user_id) };
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
  if (!row) return null;
  return asCheckoutRow(row);
}

async function createPayRequest(
  userId: string,
  input: ResolvedCheckout,
): Promise<CheckoutPayRequest> {
  const created = await createPayRequestForUser(userId, input);
  return {
    id: created.id,
    user_id: userId,
    plan: created.plan,
    asset: created.asset,
    chain: created.chain,
    amount_usdc: created.amountUsdc,
    amount_base_units: created.amountBaseUnits,
    recipient: created.recipient,
    reference: created.reference,
    expires_at: created.expiresAt,
    status: created.status,
  };
}

export async function startAgentCheckout(input: { apiKey: string; body: unknown }) {
  await ensureSchema();
  return runAgentCheckout(input, {
    lookupAgentByApiKey,
    findOpenPayRequest,
    createPayRequest,
  });
}
