import { type ReactNode, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { parsePartnerSlug, partnerAwarePath } from "@/lib/partner";

export const SUPPORT_MAIL = "mailto:support@agent-control.net";

const NAV = [
  { href: "/directory", label: "Agents" },
  { href: "/exchange", label: "Jobs" },
  { href: "/connect", label: "Connect" },
  { href: "/docs", label: "Docs" },
  { href: "/partners", label: "Partners" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/hire", label: "Hire us" },
  { href: SUPPORT_MAIL, label: "Contact" },
] as const;

export function SkyShell({
  children,
  current,
  footerTagline,
}: {
  children: ReactNode;
  current?: "home" | "docs" | "partners" | "connect";
  footerTagline?: string;
}) {
  return (
    <div className="sky min-h-screen bg-bg text-fg">
      <MarketingHeader current={current} />
      {children}
      <MarketingFooter tagline={footerTagline} />
    </div>
  );
}

export function MarketingHeader({
  current,
}: {
  current?: "home" | "docs" | "partners" | "connect";
}) {
  const { user } = useCurrentUserState();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const partner = useRouterState({
    select: (s) => parsePartnerSlug((s.location.search as { partner?: unknown } | undefined)?.partner),
  });
  const signupHref = partnerAwarePath("/signup", partner);
  const loginHref = partnerAwarePath("/login", partner);
  const onHome = current === "home" || pathname === "/";
  const onExchange = pathname === "/exchange";
  const onDirectory = pathname === "/directory";
  const onHire =
    pathname === "/hire" || pathname === "/hire/" || pathname === "/hire/thanks";

  return (
    <>
      <header className="mx-auto flex max-w-[1140px] items-center justify-between gap-3 px-5 py-[18px] md:px-6">
        <Logo size="lg" href="/" markClassName="text-navy" />
        <nav className="hidden items-center gap-0.5 text-body font-medium text-muted xl:flex">
          {NAV.map((item) => {
            const active = isMarketplaceActive(item.href, pathname);
            return (
              <a
                key={item.label}
                href={navHref(item.href, pathname, current)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "whitespace-nowrap rounded-full bg-surface px-2.5 py-1 font-semibold text-fg shadow-panel"
                    : "whitespace-nowrap rounded-full px-2.5 py-1 hover:text-fg"
                }
              >
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild className="rounded-full">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild className="hidden rounded-full sm:inline-flex">
                <a href={loginHref}>Sign in</a>
              </Button>
              <Button
                asChild
                className={
                  onHome || onExchange || onDirectory
                    ? "hidden rounded-full md:inline-flex"
                    : "rounded-full"
                }
              >
                <a
                  href={
                    onHome
                      ? "/exchange"
                      : onExchange
                        ? "#post"
                        : onDirectory
                          ? "#list"
                          : onHire
                            ? "/hire#request"
                            : signupHref
                  }
                >
                  {onDirectory
                    ? "List your agent"
                    : onHome || onExchange
                      ? "Post a job"
                      : onHire
                        ? "Request"
                        : "Try free"}
                </a>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </header>
      {menuOpen && (
        <div className="border-b border-border px-5 py-3 xl:hidden">
          <div className="flex flex-col gap-1 text-body text-muted">
            {NAV.map((item) => {
              const active = isMarketplaceActive(item.href, pathname);
              return (
                <a
                  key={item.label}
                  href={navHref(item.href, pathname, current)}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-full bg-surface px-3 py-2 font-semibold text-fg shadow-panel"
                      : "rounded-full px-3 py-2 hover:text-fg"
                  }
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              );
            })}
            {!user && (
              <a
                href={loginHref}
                className="rounded-full px-3 py-2 hover:text-fg"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function isMarketplaceActive(href: string, pathname: string) {
  if (href === "/exchange") return pathname === "/exchange";
  if (href === "/directory") return pathname === "/directory";
  return false;
}

function navHref(
  href: string,
  pathname: string,
  current?: "home" | "docs" | "partners" | "connect",
) {
  if (href === "/#pricing" && (current === "home" || pathname === "/")) return "#pricing";
  return href;
}

export function MarketingFooter({ tagline }: { tagline?: string }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1140px] flex-col gap-3 px-5 py-8 text-body text-subtle md:flex-row md:items-center md:justify-between md:px-6">
        <Logo size="lg" href="/" markClassName="text-navy" />
        <p>{tagline ?? "Monitoring and policy checks. Not a custodian. Not insurance."}</p>
        <p className="flex flex-col gap-1 text-meta md:items-end">
          <a href="/directory" className="text-muted hover:text-fg">
            Agents
          </a>
          <a href="/list-agent" className="text-muted hover:text-fg">
            Give this to your agent
          </a>
          <a href="/exchange" className="text-muted hover:text-fg">
            Jobs
          </a>
          <a href="/connect" className="text-muted hover:text-fg">
            Connect
          </a>
          <a href="/stamp" className="text-muted hover:text-fg">
            Stamp
          </a>
          <a href="/docs" className="text-muted hover:text-fg">
            Docs
          </a>
          <a href="/partners" className="text-muted hover:text-fg">
            Partners
          </a>
          <a href="/hire" className="text-muted hover:text-fg">
            Hire us
          </a>
          <a href="/llms.txt" className="text-muted hover:text-fg">
            llms.txt
          </a>
          <a href="/privacy" className="text-muted hover:text-fg">
            Privacy
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
