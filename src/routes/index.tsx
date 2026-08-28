import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Bell,
  Check,
  KeyRound,
  Lock,
  Menu,
  Shield,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { SupportedChains } from "@/components/chain-icons";
import { LandingConsole } from "@/components/landing-console";
import { LandingFaq } from "@/components/landing-faq";
import { LandingTutorial } from "@/components/landing-tutorial";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

const SUPPORT_MAIL = "mailto:support@agent-control.net";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#learn", label: "Tutorial" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: SUPPORT_MAIL, label: "Contact" },
];

function Home() {
  const { isPending } = useCurrentUserState();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-10 lg:px-16">
        <Logo size="lg" href="/" />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-fg">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isPending ? (
            <div className="h-10 w-24 animate-pulse rounded-[var(--radius-sm)] bg-elevated" />
          ) : (
            <>
              <SignedOut>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link to="/login">Start 1-day trial</Link>
                </Button>
              </SignedOut>
              <SignedIn>
                <Button asChild>
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
        <div className="border-b border-border px-6 py-3 md:hidden">
          <div className="flex flex-col gap-3 text-sm text-muted">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="hover:text-fg"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}

      <section className="landing-hero mx-auto max-w-7xl px-6 pb-16 pt-8 md:px-10 md:pt-14 lg:px-16">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="landing-rise text-xs font-medium uppercase tracking-[0.18em] text-warning">
              Pre-sign policy for agent wallets
            </p>
            <h1 className="landing-rise mt-4 text-5xl font-semibold leading-[1.1] tracking-[-0.03em] md:text-7xl">
              Your agents can spend. You set the limits.
            </h1>
            <p
              className="landing-rise mt-5 max-w-2xl text-base text-muted md:text-lg"
              style={{ animationDelay: "80ms" }}
            >
              Keep control of your agents’ spending. You set the limits. Suspicious transactions show up as alerts.
            </p>
            <div
              className="landing-rise mt-5 flex flex-wrap gap-2 text-xs text-muted"
              style={{ animationDelay: "120ms" }}
            >
              {["Not a custodian", "You hold the keys", "Solana · Ethereum · Base"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-surface/70 px-3 py-1.5"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
            <div
              className="landing-rise mt-8 flex flex-wrap gap-3"
              style={{ animationDelay: "160ms" }}
            >
              <Button size="lg" asChild>
                <Link to="/login">Start 1-day trial</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <a href="#learn">Watch the tutorial</a>
              </Button>
            </div>
            <SupportedChains className="landing-rise mt-8" />
          </div>
          <div className="min-w-0">
            <LandingConsole />
          </div>
        </div>
      </section>

      <section id="product" className="border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-16 md:grid-cols-2 md:px-10 lg:grid-cols-4 lg:px-16">
          {[
            {
              icon: Activity,
              title: "Live ingestion",
              body: "Real wallets sync from Solana, Ethereum, and Base. Demo wallets stay labeled so you can tour the console.",
            },
            {
              icon: Shield,
              title: "Policy engine",
              body: "Daily caps, max size, hourly velocity, allowlists and denylists — evaluated on every transfer and every check.",
            },
            {
              icon: KeyRound,
              title: "Pre-sign hook",
              body: "REST + MCP. Your agent calls /api/v1/check before it signs. If must_abort is true, it must not send.",
            },
            {
              icon: Bell,
              title: "Alerts + audit",
              body: "Blocks, pauses, and policy edits write an audit trail. Not a custodian — you still hold the keys.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-[var(--radius-xl)] border border-border bg-surface p-6"
            >
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-lg font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 lg:px-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            How it works
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Four steps. No custody. The agent cannot skip the check if you wire it
            in front of sign-and-broadcast.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              {
                n: "01",
                t: "Enroll a wallet",
                d: "Paste a live address. We pull native balance and recent on-chain transfers.",
              },
              {
                n: "02",
                t: "Set policy",
                d: "Cap daily spend, restrict destinations, set hourly velocity.",
              },
              {
                n: "03",
                t: "Wire the hook",
                d: "Give the agent its API key. It MUST POST /api/v1/check before every send.",
              },
              {
                n: "04",
                t: "Watch + pause",
                d: "On-chain sync and pre-sign decisions land in one feed. Pause from the console.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-[var(--radius-lg)] bg-surface p-5 ring-1 ring-border"
              >
                <p className="font-mono text-xs text-primary">{s.n}</p>
                <h3 className="mt-3 font-medium">{s.t}</h3>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <LandingTutorial />

      <section id="pricing" className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 lg:px-16">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Pricing
          </h2>
          <p className="mt-2 text-muted">
            1-day full console. No card required to start. Paid plans are USDC on
            Solana, Ethereum, or Base. You pay gas on ETH/Base. No autopay.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Object.values(PLANS).map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex flex-col rounded-[var(--radius-xl)] border p-5",
                  p.id === "pro"
                    ? "border-primary/40 bg-surface"
                    : "border-border bg-surface/70",
                )}
              >
                <p className="text-sm text-muted">{p.name}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {p.price === 0 ? "Free" : `$${p.price}`}
                  {p.price > 0 && (
                    <span className="text-sm font-normal text-muted">/mo</span>
                  )}
                </p>
                {p.id === "free" && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    1 day · no card
                  </p>
                )}
                <p className="mt-2 text-sm text-muted">{p.blurb}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    {p.agents} agent wallets
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    {p.historyDays}-day history
                  </li>
                  <li className="flex gap-2">
                    <Lock className="size-4 text-primary" />
                    Policy + pre-sign hook
                  </li>
                </ul>
                <Button
                  className="mt-6"
                  variant={p.id === "pro" ? "default" : "secondary"}
                  asChild
                >
                  <Link to="/login">
                    {p.price === 0 ? "Start 1-day trial" : "Create account"}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingFaq />

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-subtle md:flex-row md:items-center md:justify-between md:px-10 lg:px-16">
          <Logo size="lg" href="/" />
          <p>Monitoring and policy checks. Not a custodian. Not insurance.</p>
          <p className="flex flex-col gap-1 text-xs md:items-end">
            <a href={SUPPORT_MAIL} className="text-muted hover:text-fg">
              Contact · support@agent-control.net
            </a>
            <span>
              Chain marks identify supported networks. Agent Control is not affiliated
              with Solana, Ethereum, or Base.
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
