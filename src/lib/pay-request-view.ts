import { PLANS, type PlanId } from "@/lib/plans";
import {
  PAY_ASSET_DECIMALS,
  PAY_ASSET_LABEL,
  asPayAsset,
  buildNativeEthMetamaskUrl,
  buildNativeEthPayUrl,
  buildNativeSolanaPayUrl,
  formatExactAmount,
} from "@/lib/pay-asset";
import { buildEip681TransferUrl, buildMetamaskSendUrl } from "@/lib/evm-pay";
import {
  buildSolanaPayUrl,
  formatUsdcExact,
  usdcBaseUnits,
  type PayChain,
  type PayRequestView,
  type PayStatus,
} from "@/lib/solana-pay";

export const CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

export type PayRow = {
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

export function asPayChain(value: string | null | undefined): PayChain {
  if (value === "ethereum" || value === "base" || value === "solana") return value;
  return "solana";
}

export function viewPayRequest(row: PayRow): PayRequestView {
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
