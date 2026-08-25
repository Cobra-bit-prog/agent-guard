import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CreditCard,
  LayoutDashboard,
  Settings,
  Shield,
  Wallet,
} from "lucide-react";
import { type ReactNode } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Logo } from "@/components/brand";
import { TrialBanner } from "@/components/trial-banner";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Wallet },
  { to: "/policies", label: "Policies", icon: Shield },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isPending) {
    return (
      <div className="flex min-h-screen bg-bg">
        <aside className="hidden w-60 border-r border-border bg-surface md:block" />
        <div className="flex-1 p-8">
          <div className="h-8 w-48 animate-pulse rounded bg-elevated" />
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="min-h-screen bg-bg md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:h-screen md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-4 md:py-6">
        <Logo />
        <nav className="hidden flex-1 flex-col gap-1 pt-8 md:flex">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium",
                  active
                    ? "bg-elevated text-fg"
                    : "text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-border pt-4 text-xs text-subtle md:block">
          <p className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-success" />
            All systems operational
          </p>
        </div>
        <div className="md:hidden">
          <UserButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-8">
          <p className="text-sm text-muted">AI agent security monitoring</p>
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
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
