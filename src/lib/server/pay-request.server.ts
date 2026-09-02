import { getSql } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { uid } from "@/lib/utils";
import { PAY_EXPIRY_MS, usdcBaseUnits, type PayChain, type PayRequestView } from "@/lib/solana-pay";
import { newPayReference, payoutAddress } from "@/lib/solana-pay.server";
import { allocateUniqueUsdcAmount, evmPayoutAddress } from "@/lib/evm-pay.server";
import { allocateUniqueNativeAmount, quoteSolEthUsd } from "@/lib/native-pay.server";
import {
  CheckoutNotConfiguredError,
  resolveCheckoutInput,
  type PaidPlanId,
} from "@/lib/agent-checkout";
import type { PayAsset } from "@/lib/pay-asset";
import { CHAIN_LABEL, viewPayRequest, type PayRow } from "@/lib/pay-request-view";

/** Shared insert used by human Billing and agent REST checkout. Server-only. */
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
  return viewPayRequest(rows[0]);
}
