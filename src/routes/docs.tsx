import { createFileRoute } from "@tanstack/react-router";
import { SkyShell, SUPPORT_MAIL } from "@/components/marketing/chrome";
import { SupportedChains } from "@/components/chain-icons";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: "01",
    t: "Create an account",
    d: "Start a 1-day (24 hour) trial. No card.",
  },
  {
    n: "02",
    t: "Add an agent wallet",
    d: "Paste the address. You keep the keys.",
  },
  {
    n: "03",
    t: "Set spend rules",
    d: "A daily cap and where they can send.",
  },
  {
    n: "04",
    t: "Connect your agent",
    d: "Connect your agent with an API key so it checks Agent Control before every spend — you keep the keys.",
  },
  {
    n: "05",
    t: "Watch the console",
    d: "Inbox is where holds wait for you. Agent Audit builds an on-demand Excel or PDF of the check trail. Pause if something looks wrong.",
  },
] as const;

const CONNECT_STEPS = [
  {
    n: "1",
    t: "Sign up",
    d: "Start at agent-control.net. 1-day trial, no card.",
  },
  {
    n: "2",
    t: "Enroll the wallet",
    d: "Add the agent wallet address. You keep the keys.",
  },
  {
    n: "3",
    t: "Set policy",
    d: "Daily and per-tx caps, plus destinations.",
  },
  {
    n: "4",
    t: "Create an API key",
    d: "Issue an agent API key in the console.",
  },
  {
    n: "5",
    t: "Check before every send",
    d: "The agent POSTs /api/v1/check (or MCP check_transfer, then get_approval on hold). If must_abort is true, do not send.",
  },
  {
    n: "6",
    t: "Inbox and Audit",
    d: "Open /inbox for holds (Allow once / Always allow this address / Block). Open /audit for an on-demand Excel or PDF trail.",
  },
] as const;

const COMPARE = [
  {
    themName: "agentaudit.dev",
    them: "Package / CVE / dependency security registry.",
    us: "Agent payments control — spend limits, approval before agent send, Approval Inbox, Agent Audit on wallet sends.",
    pick: "Pick us when the risk is an agent spending crypto, not a vulnerable npm package.",
  },
  {
    themName: "SpendGuard",
    them: "LLM / API dollar spend and usage guards.",
    us: "On-chain wallet sends on Solana, Ethereum, and Base. External audit for your agents.",
    pick: "Pick us when the spend is crypto from an agent wallet, not model API billing.",
  },
  {
    themName: "Turnkey (and similar: Privy)",
    them: "Custody, wallet infra, TEE / key management.",
    us: "Non-custodial policy + pre-sign check. You keep the keys. Connect your agent; we answer allow / hold / block.",
    pick: "Pick us when you already have keys/wallets and need hold vs block + agent wallet audit, not a new custodian.",
  },
] as const;

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Approval Inbox and Agent Audit — Agent Control" },
      {
        name: "description",
        content:
          "Operator quick start for Agent Control. Connect your agent, decide holds in Approval Inbox, and generate Agent Audit reports. Agent payments control with spend limits. You keep the keys.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Approval Inbox and Agent Audit — Agent Control" },
      {
        property: "og:description",
        content:
          "Operator quick start: Approval Inbox, Agent Audit, and agent payments control with spend limits. You keep the keys.",
      },
    ],
  }),
});

function DocsPage() {
  return (
    <SkyShell current="docs">
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">Quick start</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
          Get set up in a few minutes
        </h1>
        <p className="mt-4 max-w-[46ch] text-lg text-muted">
          1-day trial. Agent payments control with spend limits you set. You keep the keys.
        </p>
        <SupportedChains className="mt-5" />

        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a href="#quick-start" className="text-muted hover:text-fg">
            Quick start
          </a>
          <a href="#connect-your-agent" className="text-muted hover:text-fg">
            Connect your agent
          </a>
          <a href="#compare" className="text-muted hover:text-fg">
            Compare
          </a>
          <a href="/llms.txt" className="text-muted hover:text-fg">
            llms.txt
          </a>
        </nav>

        <ol id="quick-start" className="mt-10 scroll-mt-6 space-y-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
            >
              <p className="font-mono text-xs text-navy">{s.n}</p>
              <h2 className="mt-2 text-xl font-medium">{s.t}</h2>
              <p className="mt-1 text-muted">{s.d}</p>
              {s.n === "04" ? (
                <a
                  href="#connect-your-agent"
                  className="mt-3 inline-flex text-sm font-medium text-navy hover:text-coral"
                >
                  How to connect →
                </a>
              ) : null}
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm leading-relaxed text-muted">
          The check only works if you connect your agent. If it skips the check, Inbox cannot stop
          that send.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Inbox is where off-policy and first-time destinations wait: Allow once, Always allow this
          address, or Block. Holds expire in 10 minutes and are then treated as a block. Agent Audit
          generates an on-demand Excel or PDF of the Agent Control trail — not a full chain explorer
          or ghost replay. Nothing is auto-emailed from Agent Audit. Optional warning alerts
          (Settings → Email alerts) can ping you for a policy alert, spend near the daily cap, or a
          hold waiting in Inbox.
        </p>

        <section id="connect-your-agent" className="mt-16 scroll-mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">
            Connect your agent
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            Check before spend
          </h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Agent Control adds a check before spend for agent wallets. Connect your agent so every
            send asks Agent Control first — agent spend limit and approval before agent send.
            Off-policy or first-time destinations HOLD in Approval Inbox (hold vs block). You keep
            the keys. External audit for your agents; agent payments control on Solana, Ethereum,
            and Base.
          </p>
          <ol className="mt-8 space-y-3">
            {CONNECT_STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
              >
                <p className="font-mono text-xs text-navy">{s.n}</p>
                <h3 className="mt-2 text-lg font-medium">{s.t}</h3>
                <p className="mt-1 text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
          <p id="skill-mcp" className="mt-6 scroll-mt-6 text-sm leading-relaxed text-muted">
            Coding agents (Cursor and similar) connect the same way: give the agent the API key, then
            check before spend. HTTP today: POST /api/v1/check with the Bearer key. MCP at POST
            /api/v1/mcp — tools <code className="font-mono text-fg">check_transfer</code>,{" "}
            <code className="font-mono text-fg">get_approval</code>, and{" "}
            <code className="font-mono text-fg">get_agent_status</code>. If must_abort is true, do
            not send. If the agent skips the check, Inbox cannot stop that send — funds can move.
          </p>
        </section>

        <section id="compare" className="mt-16 scroll-mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">Compare</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            When to use Agent Control
          </h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Agent payments control for on-chain wallet sends. Not a package scanner, not an LLM
            billing guard, not a custodian.
          </p>
          <div className="mt-8 space-y-3">
            {COMPARE.map((row) => (
              <article
                key={row.themName}
                className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
              >
                <h3 className="text-lg font-medium">vs {row.themName}</h3>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-fg">Them.</span> {row.them}
                </p>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-fg">Us.</span> {row.us}
                </p>
                <p className="mt-2 text-sm text-muted">{row.pick}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-[20px] border border-border bg-[#12263f] p-5 text-[#e8eef6] shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#9bb0c7]">
              When to use us
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Use Agent Control when an operator runs agent wallets that can send crypto and needs
              spend limits, approval before agent send, and an agent wallet audit trail — External
              audit for your agents — without giving up custody.
            </p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button size="lg" asChild className="rounded-full">
            <a href="/signup">
              Start free trial
              <span aria-hidden>→</span>
            </a>
          </Button>
          <a href={SUPPORT_MAIL} className="text-sm text-muted hover:text-fg">
            Contact · support@agent-control.net
          </a>
        </div>

        <details className="mt-16 rounded-[20px] border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-medium">
            For builders · API details
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4 text-sm text-muted">
            <p>
              Give the agent its API key. Before every send it should call the check. If{" "}
              <code className="font-mono text-fg">must_abort</code> is true, do not send. Pause and
              denylist still block (never hold). Off-policy or first-time destinations return{" "}
              <code className="font-mono text-fg">hold</code> with{" "}
              <code className="font-mono text-fg">poll_url</code> — poll until allow or block
              (10-minute TTL; expired holds are a block).
            </p>
            <pre className="overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
              {`curl -s https://agent-control.net/api/v1/check \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"<destination>","value_usd":2400}'`}
            </pre>
            <p>
              Hold response includes <code className="font-mono text-fg">poll_url</code> and{" "}
              <code className="font-mono text-fg">approval_id</code>. MCP tool{" "}
              <code className="font-mono text-fg">get_approval</code> polls the same decision. Same
              tools on POST /api/v1/mcp:{" "}
              <code className="font-mono text-fg">check_transfer</code>,{" "}
              <code className="font-mono text-fg">get_approval</code>,{" "}
              <code className="font-mono text-fg">get_agent_status</code>.
            </p>
          </div>
        </details>

        <p className="mt-8 text-sm text-muted">
          Machine-readable product brief:{" "}
          <a href="/llms.txt" className="font-medium text-navy hover:text-coral">
            /llms.txt
          </a>
          .
        </p>
      </main>
    </SkyShell>
  );
}
