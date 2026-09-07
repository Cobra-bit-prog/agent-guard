import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { SolanaPayBlock } from "@/components/solana-pay-block";
import { PLANS, type PlanId } from "@/lib/plans";
import { createPayRequest } from "@/lib/server/solana-billing";

export type ExpiredProfile = {
  plan?: string;
  expired?: boolean;
  writable?: boolean;
  agentLimit?: number;
  agentCount?: number;
};

export function ExpiredPaywall({ profile }: { profile?: ExpiredProfile | null }) {
  const plan = (profile?.plan ?? "free") as PlanId;
  const trial = plan === "free";
  const name = PLANS[plan]?.name ?? "Free";
  const pay = useMutation({
    mutationFn: () => createPayRequest({ data: { plan: "starter", asset: "usdc" } }),
  });

  useEffect(() => {
    if (!pay.data && !pay.isPending && !pay.isError) pay.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring paused</h1>
        <p className="text-sm text-muted">
          {trial
            ? "Your 1-day free trial has ended. Pay $29 USDC on Solana to keep the console."
            : `${name} ended. Pay $29 USDC on Solana to resume monitoring.`}
        </p>
      </div>
      {pay.data?.id ? (
        <SolanaPayBlock id={pay.data.id} plan="starter" lock />
      ) : pay.isError ? (
        <SolanaPayBlock plan="starter" lock />
      ) : (
        <div className="h-80 animate-pulse rounded-[20px] bg-elevated" />
      )}
    </div>
  );
}
