import { type ReactNode, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const SUPPORT_MAIL = "mailto:support@agent-control.net";

const NAV = [
  { href: "/docs", label: "Docs" },
  { href: "/#pricing", label: "Pricing" },
  { href: SUPPORT_MAIL, label: "Contact" },
] as const;

export function SkyShell({
  children,
  current,
}: {
  children: ReactNode;
  current?: "home" | "docs";
}) {
  return (
    <div className="sky min-h-screen bg-bg text-fg">
      <MarketingHeader current={current} />
      {children}
      <MarketingFooter />
    </div>
  );
}

export function MarketingHeader({ current }: { current?: "home" | "docs" }) {
  const { isPending } = useCurrentUserState();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <header className="mx-auto flex max-w-[1140px] items-center justify-between gap-3 px-5 py-[18px] md:px-6">
        <Logo size="lg" href="/" markClassName="text-navy" />
        <nav className="hidden items-center text-sm font-medium text-muted md:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={navHref(item.href, pathname, current)}
              className="ml-4 hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isPending ? (
            <div className="h-10 w-24 animate-pulse rounded-full bg-elevated" />
          ) : (
            <>
              <SignedOut>
                <Button variant="ghost" asChild className="hidden rounded-full sm:inline-flex">
                  <a href="/login">Sign in</a>
                </Button>
                <Button asChild className="rounded-full">
                  <a href="/signup">Try free</a>
                </Button>
              </SignedOut>
              <SignedIn>
                <Button asChild className="rounded-full">
                  <Link to="/dashboard">Open dashboard</Link>
                </Button>
              </SignedIn>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </header>
      {menuOpen && (
        <div className="border-b border-border px-5 py-3 md:hidden">
          <div className="flex flex-col gap-3 text-sm text-muted">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={navHref(item.href, pathname, current)}
                className="hover:text-fg"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <SignedOut>
              <a href="/login" className="hover:text-fg" onClick={() => setMenuOpen(false)}>
                Sign in
              </a>
            </SignedOut>
          </div>
        </div>
      )}
    </>
  );
}

function navHref(href: string, pathname: string, current?: "home" | "docs") {
  if (href === "/#pricing" && (current === "home" || pathname === "/")) return "#pricing";
  return href;
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1140px] flex-col gap-3 px-5 py-8 text-sm text-subtle md:flex-row md:items-center md:justify-between md:px-6">
        <Logo size="lg" href="/" markClassName="text-navy" />
        <p>Monitoring and policy checks. Not a custodian. Not insurance.</p>
        <p className="flex flex-col gap-1 text-xs md:items-end">
          <a href="/docs" className="text-muted hover:text-fg">
            Docs
          </a>
          <a href={SUPPORT_MAIL} className="text-muted hover:text-fg">
            Contact · support@agent-control.net
          </a>
          <span>
            Chain marks identify supported networks. Agent Control is not affiliated with Solana,
            Ethereum, or Base.
          </span>
        </p>
      </div>
    </footer>
  );
}
