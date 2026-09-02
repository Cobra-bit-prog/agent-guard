import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  CreditCard,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  Settings,
  Shield,
  Wallet,
} from "lucide-react";
import { type ReactNode } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Logo } from "@/components/brand";
import { ExpiredPaywall } from "@/components/expired-paywall";
import { TrialBanner } from "@/components/trial-banner";
import { useQuery } from "@tanstack/react-query";
import { getProfile, getHoldCount } from "@/lib/server/guard";
import { PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/agents", label: "Agents", icon: Wallet },
  { to: "/audit", label: "Audit", icon: FileSpreadsheet },
  { to: "/policies", label: "Policies", icon: Shield },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

const LOCKED_PREFIXES = ["/dashboard", "/inbox", "/agents", "/audit", "/policies", "/alerts"];

function isLockedPath(pathname: string) {
  return LOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
    enabled: Boolean(user),
  });
  const holds = useQuery({
    queryKey: ["holds-count"],
    queryFn: () => getHoldCount(),
    refetchInterval: 8000,
    enabled: Boolean(user),
  });
  const holdCount = holds.data?.count ?? 0;
  const expired = Boolean(profile.data?.expired);
  const lockConsole = isLockedPath(pathname);

  if (isPending) {
    return (
      <div className="flex min-h-screen bg-bg">
        <aside className="hidden w-60 border-r border-border bg-surface md:block" />
        <div className="flex-1 space-y-4 p-8">
          <div className="h-8 w-48 animate-pulse rounded bg-elevated" />
          <div className="grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[16px] bg-elevated" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-[16px] bg-elevated" />
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!user.isDevFallback && !user.emailVerified) {
    return <Navigate to="/verify-email" search={{ email: undefined }} />;
  }

  return (
    <div className="min-h-screen bg-bg md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:h-screen md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-4 md:py-6">
        <Link
          to="/dashboard"
          aria-label="Overview"
          className="inline-flex min-h-11 min-w-11 items-center"
        >
          <Logo />
        </Link>
        <nav className="hidden flex-1 flex-col gap-1 pt-8 md:flex">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium",
                  active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                )}
                <Icon className="size-4" />
                {item.label}
                {item.to === "/inbox" && holdCount > 0 && (
                  <span className="ml-auto rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-medium text-warning">
                    {holdCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <SidebarPlan />
        <div className="hidden border-t border-border pt-4 text-xs text-subtle md:block">
          <p className="flex items-center gap-2">
            <span
              className={
                expired
                  ? "size-1.5 rounded-full bg-warning"
                  : "size-1.5 animate-pulse rounded-full bg-success"
              }
            />
            {expired ? "Monitoring paused" : "All systems operational"}
          </p>
        </div>
        <div className="md:hidden">
          <UserButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-8">
          <InAppBack pathname={pathname} />
          <div className="hidden md:block">
            <UserButton />
          </div>
        </header>
        <TrialBanner />
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
                  active ? "bg-elevated text-fg" : "text-muted",
                )}
              >
                {item.label}
                {item.to === "/inbox" && holdCount > 0 ? ` (${holdCount})` : ""}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          {lockConsole && (profile.isPending || profile.isLoading) ? (
            <div className="space-y-4">
              <div className="h-8 w-48 animate-pulse rounded bg-elevated" />
              <div className="h-40 animate-pulse rounded-[16px] bg-elevated" />
            </div>
          ) : lockConsole && expired ? (
            <ExpiredPaywall profile={profile.data} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

function InAppBack({ pathname }: { pathname: string }) {
  if (pathname === "/dashboard") {
    return <p className="text-sm text-muted">Agent wallets · pre-sign checks</p>;
  }
  const linkClass = "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg";
  const inner = (
    <>
      <ChevronLeft className="size-4" />
      Back
    </>
  );
  if (pathname.startsWith("/agents/")) {
    return (
      <Link to="/agents" aria-label="Back" className={linkClass}>
        {inner}
      </Link>
    );
  }
  if (pathname.startsWith("/billing/") && pathname !== "/billing") {
    return (
      <Link to="/billing" aria-label="Back" className={linkClass}>
        {inner}
      </Link>
    );
  }
  return (
    <Link to="/dashboard" aria-label="Back" className={linkClass}>
      {inner}
    </Link>
  );
}

function SidebarPlan() {
  const q = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const plan = (q.data?.plan ?? "free") as PlanId;
  const expired = Boolean(q.data?.expired);
  const label = expired && plan === "free" ? "Trial" : (PLANS[plan]?.name ?? plan);
  const sub =
    expired && plan === "free"
      ? "1-day trial ended"
      : expired
        ? "Ended — pay to continue"
        : plan === "free"
          ? "1-day trial"
          : "USDC on Solana";
  return (
    <div className="mt-auto hidden rounded-[12px] border border-border bg-elevated/50 p-3 text-xs md:block">
      <p className="text-[10px] uppercase tracking-wider text-subtle">Current plan</p>
      <p className={expired ? "mt-1 font-semibold text-primary" : "mt-1 font-semibold"}>{label}</p>
      <p className="text-muted">{sub}</p>
    </div>
  );
}
