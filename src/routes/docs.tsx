import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Quickstart — Agent Control" },
      {
        name: "description",
        content:
          "Enroll an agent wallet, set policy, then POST /api/v1/check before the agent signs. If must_abort is true, do not send.",
      },
      { property: "og:title", content: "Quickstart — Agent Control" },
    ],
  }),
});

function DocsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-10 lg:px-16">
        <Logo size="lg" href="/" />
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-muted hover:text-fg">
            Home
          </a>
          <Button asChild>
            <Link to="/login">Start 1-day trial</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-warning">
          Docs
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
          Quickstart — Agent Control
        </h1>
        <p className="mt-4 text-lg text-muted">
          Spend control for agent wallets on Solana, Ethereum, and Base. You set
          a daily cap and where they can send. Before an agent signs, it has to
          clear those rules. You keep the keys.
        </p>

        <ol className="mt-10 space-y-8">
          <li>
            <p className="font-mono text-xs text-primary">01</p>
            <h2 className="mt-2 text-xl font-medium">Enroll an agent wallet</h2>
            <p className="mt-2 text-muted">
              Paste a live address on Solana, Ethereum, or Base. You hold the
              keys. Agent Control is not a custodian.
            </p>
          </li>
          <li>
            <p className="font-mono text-xs text-primary">02</p>
            <h2 className="mt-2 text-xl font-medium">Set policy</h2>
            <p className="mt-2 text-muted">
              Daily cap, max size, hourly velocity, allowlist and denylist.
              Evaluated on every transfer and every check.
            </p>
          </li>
          <li>
            <p className="font-mono text-xs text-primary">03</p>
            <h2 className="mt-2 text-xl font-medium">
              POST /api/v1/check before the agent signs
            </h2>
            <p className="mt-2 text-muted">
              Send destination + value_usd and the agent API key. Call this in
              front of sign-and-broadcast.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-elevated p-4 font-mono text-xs leading-relaxed text-fg">
{`curl -s https://agent-control.net/api/v1/check \
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"0x91c4a2e100000000000000000000000000000001","value_usd":2400}'`}
            </pre>
            <p className="mt-3 text-sm text-muted">
              Example response when the send is over the daily cap:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-elevated p-4 font-mono text-xs leading-relaxed text-fg">
{`{
  "decision": "block",
  "reasons": ["over daily cap"],
  "must_abort": true,
  "paused": false
}`}
            </pre>
          </li>
          <li>
            <p className="font-mono text-xs text-primary">04</p>
            <h2 className="mt-2 text-xl font-medium">Honor must_abort</h2>
            <p className="mt-2 text-muted">
              If the response has must_abort: true, the agent must not send.
              The signature should never leave the agent.
            </p>
          </li>
          <li>
            <p className="font-mono text-xs text-primary">05</p>
            <h2 className="mt-2 text-xl font-medium">Watch alerts</h2>
            <p className="mt-2 text-muted">
              Suspicious and blocked checks show up as alerts in the console.
            </p>
          </li>
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Button size="lg" asChild>
            <Link to="/login">Start 1-day trial</Link>
          </Button>
          <a
            href="mailto:support@agent-control.net"
            className="text-sm text-muted hover:text-fg"
          >
            Contact · support@agent-control.net
          </a>
        </div>
      </main>
    </div>
  );
}
