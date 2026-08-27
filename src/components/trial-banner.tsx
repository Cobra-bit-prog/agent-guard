import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/lib/server/guard";
import { formatTrialLeft, PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const q = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const p = q.data;
  if (!p) return null;
  const plan = (p.plan ?? "free") as PlanId;

  if (p.expired) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm md:px-8">
        <p>
          {plan === "free"
            ? "Your 1-day free trial has ended. Monitoring is paused until you pay in USDC."
            : `${PLANS[plan].name} ended. Pay again on Billing to keep monitoring.`}
        </p>
        <Link to="/billing" className="font-medium text-primary hover:underline">
          Open billing
        </Link>
      </div>
    );
  }

  if (plan !== "free") return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-warning/25 bg-warning/10 px-4 py-2 text-sm md:px-8",
      )}
    >
      <p>
        Free trial — {formatTrialLeft(p.msLeft)}. Then a paid plan is required.
      </p>
      <Link to="/billing" className="font-medium text-primary hover:underline">
        View plans
      </Link>
    </div>
  );
}
