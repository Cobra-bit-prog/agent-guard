import { createFileRoute } from "@tanstack/react-router";
import { CopyCode } from "@/components/copy-code";
import { SkyShell, SUPPORT_MAIL } from "@/components/marketing/chrome";
import { ConnectCtas } from "@/components/marketing/connect-path";
import { SupportedChains } from "@/components/chain-icons";
import { AGENTKIT_RECIPE_CODE, AGENTKIT_RECIPE_STEPS } from "@/lib/agentkit-recipe";
import { CONNECT_STEPS as CONNECT_PATH_STEPS } from "@/lib/connect-path";

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
    d: "Inbox is where holds wait for you. Agent Audit builds an on-demand Excel, PDF, or CSV of the check trail. Pause if something looks wrong.",
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
    d: "The agent POSTs /api/v1/check (or MCP check_transfer, then get_approval on hold). If the check says stop, do not send.",
  },
  {
    n: "6",
    t: "Inbox and Audit",
    d: "Open /inbox for holds (Allow once / Always allow this address / Block). Open /audit for an on-demand Excel, PDF, or CSV trail.",
  },
] as const;

type CompareRow = {
  themName: string;
  them: string;
  us: string;
  pick: string;
  themList?: readonly string[];
  usList?: readonly string[];
};

const COMPARE: readonly CompareRow[] = [
  {
    themName: "agentaudit.dev",
    them: "They scan code packages.",
    us: "Agent payments control — spend limits, approval before agent send, Approval Inbox, Agent Audit on wallet sends.",
    pick: "Pick us when the risk is an agent spending crypto, not a code package.",
  },
  {
    themName: "SpendGuard",
    them: "x402-spendguard: a firewall you run on your own machine. For EVM and x402. You run it yourself.",
    us: "Hosted Approval Inbox and Agent Audit. Solana, Ethereum, and Base. You set the limits. You keep the keys.",
    pick: "They run on your machine. We host the human inbox. You can use both.",
    themList: ["A firewall you run on your own machine", "For EVM and x402", "You run it yourself"],
    usList: [
      "Hosted Approval Inbox and Agent Audit",
      "Solana, Ethereum, and Base",
      "You set the limits. You keep the keys.",
    ],
  },
  {
    themName: "Agentspay",
    them: "A control plane or cards. Some teams use DIY libs.",
    us: "Hosted Approval Inbox and Agent Audit on Solana, Ethereum, and Base. You keep the keys.",
    pick: "You can use both. They are a control plane or cards. We sit beside the wallet you already have.",
    themList: ["Control plane or cards", "Or DIY libs you run yourself"],
    usList: [
      "Hosted Approval Inbox and Agent Audit",
      "Solana, Ethereum, and Base",
      "You keep the keys.",
    ],
  },
  {
    themName: "Turnkey (and similar: Privy)",
    them: "Wallets and keys.",
    us: "Connect your agent. We answer allow / hold vs block. You keep the keys.",
    pick: "Pick us when you already have keys and need hold vs block plus an agent wallet audit.",
  },
];

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
          <a href="#connect-agentkit" className="text-muted hover:text-fg">
            AgentKit / x402
          </a>
          <a href="/connect" className="text-muted hover:text-fg">
            Connect path
          </a>
          <a href="#connectors" className="text-muted hover:text-fg">
            Connectors
          </a>
          <a href="#agent-storefront" className="text-muted hover:text-fg">
            Agent storefront
          </a>
          <a href="#adapters" className="text-muted hover:text-fg">
            Adapters
          </a>
          <a href="#policy-recipe" className="text-muted hover:text-fg">
            Policy recipe
          </a>
          <a href="#compare" className="text-muted hover:text-fg">
            Compare
          </a>
          <a href="/partners" className="text-muted hover:text-fg">
            Partners
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
          address, or Block. Holds expire in 10 minutes and are then treated as a block. When a
          spend is held, optional email (Settings → Email alerts) and a Slack incoming webhook (if
          you set the URL in Settings) can ping you with a link to Approval Inbox. No action within
          10 minutes = block — the agent must abort. Agent Audit generates an on-demand Excel, PDF,
          or CSV of the Agent Control trail — not a full chain explorer or ghost replay. Nothing is
          auto-emailed from Agent Audit. Optional warning alerts can also ping you for a policy
          alert or spend near the daily cap.
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
          <p className="mt-3 max-w-[52ch] text-muted">
            Works with Coinbase AgentKit and any agent that can ask before it sends.
          </p>
          <article
            id="connect-agentkit"
            className="mt-8 scroll-mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
          >
            <h3 className="text-lg font-medium">Connect AgentKit / x402</h3>
            <p className="mt-2 text-sm text-muted">
              About three minutes. They ask before they pay. You keep the keys. External audit for
              your agents. Starter $29.
            </p>
            <ol className="mt-4 space-y-3">
              {CONNECT_PATH_STEPS.map((step) => (
                <li key={step.n}>
                  <p className="font-mono text-xs text-navy">{step.n}</p>
                  <p className="mt-1 font-medium text-fg">{step.t}</p>
                  <p className="mt-1 text-sm text-muted">{step.d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <ConnectCtas size="default" />
            </div>
            <p className="mt-3 text-sm text-muted">
              Same POST /api/v1/check — MCP{" "}
              <code className="font-mono text-fg">check_transfer</code> and the adapters wrap it.{" "}
              <a href="/connect" className="font-medium text-navy hover:text-coral">
                Open the connect path →
              </a>
            </p>
          </article>
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
          <article
            id="agentkit"
            className="mt-8 scroll-mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
          >
            <h3 className="text-lg font-medium">Coinbase AgentKit (and similar)</h3>
            <p className="mt-2 text-sm text-muted">
              If your agent already asks before it sends — like Coinbase AgentKit — send that ask to
              Agent Control. You set the limit. Over the line → hold vs block.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>You set the spend limit in Agent Control.</li>
              <li>The agent asks before every send.</li>
              <li>Under the limit, it can send.</li>
              <li>Over the line: hold waits in Approval Inbox. Block means do not send.</li>
              <li>You keep the keys.</li>
            </ul>
            <p className="mt-4 text-sm text-muted">That ask is POST /api/v1/check:</p>
            <pre className="mt-2 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
              {`fetch("https://agent-control.net/api/v1/check", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_AGENT_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ to: destination, value_usd: amount }),
})`}
            </pre>
            <p className="mt-3 text-sm text-muted">
              If the check says stop, do not send. Prefer the{" "}
              <a href="#adapters" className="font-medium text-navy hover:text-coral">
                adapter
              </a>{" "}
              if you do not want to write fetch yourself.
            </p>
          </article>
          <article
            id="adapters"
            className="mt-8 scroll-mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
          >
            <h3 className="text-lg font-medium">Adapters</h3>
            <p className="mt-2 text-sm text-muted">
              Drop-in helpers so you do not write fetch yourself. They only call the same check.
              Connect your agent. You keep the keys.
            </p>
            <p className="mt-3 text-sm text-muted">
              Allow means send. Wait is a hold — you decide in Approval Inbox (hold vs block). Stop
              means do not send.
            </p>
            <p className="mt-4 text-sm text-muted">Coinbase AgentKit — pass the policy helper:</p>
            <CopyCode code={AGENTKIT_RECIPE_CODE} label="Copy" />
            <p className="mt-3 text-sm text-muted">
              Daily cap + approval threshold recipe:{" "}
              <a href="#policy-recipe" className="font-medium text-navy hover:text-coral">
                Policy recipe
              </a>
              . Partner signup with{" "}
              <a
                href="/partners?partner=agentkit"
                className="font-medium text-navy hover:text-coral"
              >
                ?partner=agentkit
              </a>
              .
            </p>
            <p className="mt-4 text-sm text-muted">x402 — run the same check before money moves:</p>
            <pre className="mt-2 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
              {`import { createX402BeforePaymentHook } from "./src/adapters/x402.ts";

client.onBeforePaymentCreation(
  createX402BeforePaymentHook({ apiKey: process.env.AGENT_CONTROL_API_KEY }),
);`}
            </pre>
            <p className="mt-3 text-sm text-muted">
              Copy <code className="font-mono text-fg">src/adapters</code> from the repo. If the
              check says stop, do not send. Wallet and runtime partners:{" "}
              <a href="/partners" className="font-medium text-navy hover:text-coral">
                /partners
              </a>
              .
            </p>
          </article>
          <article
            id="policy-recipe"
            className="mt-8 scroll-mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
          >
            <h3 className="text-lg font-medium">AgentKit policy recipe</h3>
            <p className="mt-2 text-sm text-muted">
              Daily cap + approval threshold, then Connect your agent. Copy this tiny
              createAgentKitPolicyProvider helper. You keep the keys.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
              {AGENTKIT_RECIPE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <CopyCode code={AGENTKIT_RECIPE_CODE} label="Copy recipe" />
            <p className="mt-3 text-sm text-muted">
              Same check as{" "}
              <a href="#adapters" className="font-medium text-navy hover:text-coral">
                adapters
              </a>
              . If the check says stop, do not send.
            </p>
          </article>
          <article
            id="hold-notifications"
            className="mt-8 scroll-mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
          >
            <h3 className="text-lg font-medium">Hold notifications</h3>
            <p className="mt-2 text-sm text-muted">
              When a spend is held, we reuse the same email and Slack paths already in Settings. No
              extra vendor.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Email alerts (on by default) send a link to Approval Inbox.</li>
              <li>Paste a Slack incoming webhook URL in Settings to get the same ping there.</li>
              <li>No action within 10 minutes = block — the agent must abort.</li>
            </ul>
          </article>
          <p id="skill-mcp" className="mt-6 scroll-mt-6 text-sm leading-relaxed text-muted">
            Coding agents (Cursor and similar) connect the same way: give the agent the API key,
            then check before spend. HTTP today: POST /api/v1/check with the Bearer key. The MCP
            path is Streamable HTTP: POST JSON-RPC to /api/v1/mcp and the server answers as JSON or
            as a short event stream, with a session header on initialize. Tools:{" "}
            <code className="font-mono text-fg">check_transfer</code>,{" "}
            <code className="font-mono text-fg">get_approval</code>,{" "}
            <code className="font-mono text-fg">get_agent_status</code>, plus storefront{" "}
            <code className="font-mono text-fg">get_pricing</code>,{" "}
            <code className="font-mono text-fg">start_trial</code>,{" "}
            <code className="font-mono text-fg">attach_human</code>,{" "}
            <code className="font-mono text-fg">create_checkout</code>, and{" "}
            <code className="font-mono text-fg">get_status</code>. If the check says stop, do not
            send. If the agent skips the check, Inbox cannot stop that send — funds can move. How to
            add the connector in Cursor or Grok:{" "}
            <a href="#connectors" className="font-medium text-navy hover:text-coral">
              Connectors
            </a>
            .
          </p>
          <article
            id="connectors"
            className="mt-8 scroll-mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
          >
            <h3 className="text-lg font-medium">Connectors</h3>
            <p className="mt-2 text-sm text-muted">
              External audit for your agents. Connect your agent from Cursor or Grok so it can ask
              before a send. You keep the keys. The live MCP is Streamable HTTP at
              https://agent-control.net/api/v1/mcp. get_pricing is public. Spend, checkout, and
              status need header Authorization: Bearer plus your agent API key (env{" "}
              <code className="font-mono text-fg">AGENT_CONTROL_API_KEY</code>).
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
              <li>
                <span className="font-medium text-fg">Cursor Customize / MCPs.</span> Open
                Customize, then MCPs. Add a remote server. Paste the URL. Add the Bearer header. Or
                load this repo as a local plugin and set the key under Plugins → Configure.
              </li>
              <li>
                <span className="font-medium text-fg">Grok Bot Plugins.</span> Once listed, add
                Agent Control from Settings → Plugins. Until then, custom add: same URL and Bearer
                header.
              </li>
              <li>
                <span className="font-medium text-fg">Grok.com → connectors → Custom.</span> New
                Connector, then Custom. Paste the same URL. When asked for auth, use Authorization:
                Bearer plus the agent API key.
              </li>
            </ol>
            <p className="mt-3 text-sm text-muted">
              After connect: check before spend. Hold vs block waits in Approval Inbox. If the agent
              skips the check, Inbox cannot stop that send.
            </p>
          </article>
        </section>

        <section id="agent-storefront" className="mt-16 scroll-mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">
            Agent storefront
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            Price, trial, and checkout for agents
          </h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Agents find us via{" "}
            <a href="/llms.txt" className="font-medium text-navy hover:text-coral">
              /llms.txt
            </a>{" "}
            and MCP. A human principal signs up and owns billing and Approval Inbox; agents connect
            under that account. You keep the keys.
          </p>
          <p className="mt-3 max-w-[52ch] text-muted">
            1-day trial, no card, no KYC. Then Starter $29 / Pro $49 / Team $149 in USDC on Solana.
            The agent opens the pay request. The human pays. Agents cannot decide Approval Inbox.
          </p>
          <ol className="mt-8 space-y-3">
            <li className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
              <p className="font-mono text-xs text-navy">1</p>
              <h3 className="mt-2 text-lg font-medium">Read pricing</h3>
              <p className="mt-1 text-muted">
                GET /api/v1/storefront/pricing or MCP get_pricing. No API key.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
                {`fetch("https://agent-control.net/api/v1/storefront/pricing")`}
              </pre>
            </li>
            <li className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
              <p className="font-mono text-xs text-navy">2</p>
              <h3 className="mt-2 text-lg font-medium">Start a trial for a human</h3>
              <p className="mt-1 text-muted">
                POST /api/v1/storefront/trial with that person&apos;s email. Agents cannot open a
                root account. attach_human is the same idea when you already have a principal.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
                {`fetch("https://agent-control.net/api/v1/storefront/trial", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ human_email: "ops@example.com" }),
})`}
              </pre>
            </li>
            <li className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
              <p className="font-mono text-xs text-navy">3</p>
              <h3 className="mt-2 text-lg font-medium">Start checkout</h3>
              <p className="mt-1 text-muted">
                POST /api/v1/billing/checkout with the agent API key. That opens a pay request for
                the human principal — Solana USDC by default.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
                {`fetch("https://agent-control.net/api/v1/billing/checkout", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_AGENT_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ plan: "starter" }),
})`}
              </pre>
            </li>
          </ol>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            GET /api/v1/storefront/status returns that human&apos;s trial or plan. MCP tools:{" "}
            <code className="font-mono text-fg">get_pricing</code>,{" "}
            <code className="font-mono text-fg">start_trial</code>,{" "}
            <code className="font-mono text-fg">attach_human</code>,{" "}
            <code className="font-mono text-fg">create_checkout</code>,{" "}
            <code className="font-mono text-fg">get_status</code>. Then{" "}
            <a href="#connect-your-agent" className="font-medium text-navy hover:text-coral">
              connect your agent
            </a>{" "}
            so every send asks Agent Control first.
          </p>
        </section>

        <section id="compare" className="mt-16 scroll-mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">Compare</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            When to use Agent Control
          </h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Agent payments control for agent wallets. Not a package scanner. Not a firewall you run
            on your own machine. Not a control plane or cards. You keep the keys. You can use both
            SpendGuard DIY and Agentspay beside us.
          </p>
          <div className="mt-8 space-y-3">
            {COMPARE.map((row) => (
              <article
                key={row.themName}
                className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
              >
                <h3 className="text-lg font-medium">
                  vs {row.themName}
                  {row.themName === "SpendGuard" ? (
                    <span className="mt-1 block text-sm font-normal text-muted">
                      x402-spendguard
                    </span>
                  ) : null}
                  {row.themName === "Agentspay" ? (
                    <span className="mt-1 block text-sm font-normal text-muted">
                      control plane or cards
                    </span>
                  ) : null}
                </h3>
                {row.themList ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-fg">Them.</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                      {row.themList.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    <span className="font-medium text-fg">Them.</span> {row.them}
                  </p>
                )}
                {row.usList ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-fg">Us.</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                      {row.usList.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    <span className="font-medium text-fg">Us.</span> {row.us}
                  </p>
                )}
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

        <section id="partners" className="mt-16 scroll-mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">Partners</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            Wallet and runtime partners
          </h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Agent Control complements wallets and runtimes (Turnkey, Privy, Coinbase, x402) — it
            does not replace them. Non-custodial external audit: spend limits, Approval Inbox (hold
            vs block), and Agent Audit. You keep the keys.{" "}
            <a href="/partners" className="font-medium text-navy hover:text-coral">
              Partner page
            </a>
            . Adapters:{" "}
            <a href="#adapters" className="font-medium text-navy hover:text-coral">
              Connect your agent
            </a>
            . First-touch links use <span className="font-mono text-fg">?partner=</span> on signup.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <ConnectCtas />
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
              tools on Streamable HTTP POST /api/v1/mcp:{" "}
              <code className="font-mono text-fg">check_transfer</code>,{" "}
              <code className="font-mono text-fg">get_approval</code>,{" "}
              <code className="font-mono text-fg">get_agent_status</code>, plus storefront{" "}
              <code className="font-mono text-fg">get_pricing</code>,{" "}
              <code className="font-mono text-fg">start_trial</code>,{" "}
              <code className="font-mono text-fg">attach_human</code>,{" "}
              <code className="font-mono text-fg">create_checkout</code>,{" "}
              <code className="font-mono text-fg">get_status</code>.
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
