import { createFileRoute } from "@tanstack/react-router";
import { SkyShell, SUPPORT_MAIL } from "@/components/marketing/chrome";
import { Button } from "@/components/ui/button";
import { parsePartnerSlug } from "@/lib/partner";

const POSITIONING = [
  {
    them: "Turnkey, Privy, Coinbase, x402",
    they: "Wallets, keys, signing, TEE / runtime. You keep the keys.",
    we: "Non-custodial external audit beside the wallet: spend limits, Approval Inbox (hold vs block), Agent Audit.",
  },
  {
    them: "Agent Control",
    they: "Not a wallet. Not a custodian. Not another key store.",
    we: "The operator-facing check before send — Connect your agent, then POST /api/v1/check.",
  },
] as const;

export const Route = createFileRoute("/partners")({
  component: PartnersPage,
  validateSearch: (search: Record<string, unknown>): { partner?: string } => {
    const partner = parsePartnerSlug(search.partner);
    return partner ? { partner } : {};
  },
  head: () => ({
    meta: [
      { title: "Wallet partners — Agent Control" },
      {
        name: "description",
        content:
          "Agent Control is non-custodial external audit beside wallets (Turnkey, Privy, Coinbase, x402) — not another wallet. Approval Inbox, Agent Audit, and agent payments control. You keep the keys.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Wallet partners — Agent Control" },
      {
        property: "og:description",
        content:
          "Add Agent Control as the non-custodial check before send. Approval Inbox and Agent Audit when humans keep the keys. You keep the keys.",
      },
    ],
  }),
});

function PartnersPage() {
  return (
    <SkyShell current="partners">
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">
          For wallet and runtime partners
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
          External audit beside your wallet
        </h1>
        <p className="mt-4 max-w-[54ch] text-lg text-muted">
          After your agent wallet signs within policy, builders still need an operator-facing
          Approval Inbox and Agent Audit when humans keep the keys across wallets and chains. Add
          Agent Control as the non-custodial check before send.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">What you are. What we are.</h2>
          <div className="mt-6 space-y-3">
            {POSITIONING.map((row) => (
              <article
                key={row.them}
                className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
              >
                <h3 className="text-lg font-medium">{row.them}</h3>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-fg">You.</span> {row.they}
                </p>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium text-fg">Agent Control.</span> {row.we}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">Why recommend us next to you</h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Operators run agents across wallets and chains and still need spend limits, approval
            before agent send, hold vs block, and an agent wallet audit trail. Agent Control is
            external audit for your agents — agent payments control without taking custody. You keep
            the keys.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">Minimal integration</h2>
          <ol className="mt-6 space-y-3">
            {[
              {
                n: "1",
                t: "Sign up",
                d: "Start a 1-day trial. No card. No KYC.",
              },
              {
                n: "2",
                t: "Create an API key",
                d: "Issue a key in the console for the agent wallet.",
              },
              {
                n: "3",
                t: "POST /api/v1/check",
                d: "Before send: destination + value_usd. If must_abort is true, do not send.",
              },
              {
                n: "4",
                t: "Hold poll",
                d: "Off-policy or first-time destinations HOLD. Poll poll_url until allow or block (10-minute TTL). Decide in Approval Inbox.",
              },
            ].map((s) => (
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
          <p className="mt-6 text-sm text-muted">
            Full operator steps:{" "}
            <a href="/docs#connect-your-agent" className="font-medium text-navy hover:text-coral">
              Connect your agent
            </a>
            . Positioning vs wallets and other tools:{" "}
            <a href="/docs#compare" className="font-medium text-navy hover:text-coral">
              Compare
            </a>
            .
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">Partner signup links</h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Use a first-touch <span className="font-mono text-fg">?partner=</span> slug on signup or
            login so we can attribute the account. We store it only if the account has no partner
            yet.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
            {`https://agent-control.net/login?partner=turnkey
https://agent-control.net/login?mode=signup&partner=privy
https://agent-control.net/partners?partner=x402`}
          </pre>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            1-day full console trial, then Starter $29 / Pro $49 / Team $149 USDC (or native SOL /
            ETH from Billing). No card. No KYC.
          </p>
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
      </main>
    </SkyShell>
  );
}
