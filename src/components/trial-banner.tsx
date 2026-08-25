import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/lib/server/guard";
import { formatTrialLeft } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const q = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const p = q.data;
  if (!p || p.plan !== "free") return null;

  if (p.expired) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm md:px-8">
        <p>Your 3-day free trial has ended. Monitoring is paused until you upgrade.</p>
        <Link to="/billing" className="font-medium text-primary hover:underline">
          Upgrade now
        </Link>
      </div>
    );
  }

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
