import { createFileRoute } from "@tanstack/react-router";
import { CopyCode } from "@/components/copy-code";
import { SkyShell } from "@/components/marketing/chrome";
import { ConnectCtas, ConnectSteps } from "@/components/marketing/connect-path";
import { SupportedChains } from "@/components/chain-icons";
import {
  CONNECT_AGENTKIT_CODE,
  CONNECT_CHECK_CODE,
  CONNECT_CHECK_PATH,
  CONNECT_HEADLINE,
  CONNECT_LEDE,
  CONNECT_MCP_TOOL,
  CONNECT_STARTER_LINE,
  CONNECT_X402_CODE,
} from "@/lib/connect-path";

export const Route = createFileRoute("/connect")({
  component: ConnectPage,
  head: () => ({
    meta: [
      { title: "Connect AgentKit / x402 — Agent Control" },
      {
        name: "description",
        content:
          "Connect your agent in about three minutes. They ask before they pay. You keep the keys. 1-day trial, then Pay $29 USDC on Solana. No card. No KYC.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Connect AgentKit / x402 — Agent Control" },
      {
        property: "og:description",
        content:
          "Connect your agent. Call check before they pay. Start a 1-day trial. Then Pay $29. You keep the keys.",
      },
    ],
  }),
});

function ConnectPage() {
  return (
    <SkyShell current="connect">
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">
          Connect your agent
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
          {CONNECT_HEADLINE}
        </h1>
        <p className="mt-4 max-w-[46ch] text-lg text-muted">{CONNECT_LEDE}</p>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-snug text-fg">
          {CONNECT_STARTER_LINE}
        </p>
        <SupportedChains className="mt-5" />

        <div className="mt-8">
          <ConnectCtas />
        </div>
        <p className="mt-2 text-xs font-medium leading-snug text-muted">
          1-day (24 hour) trial, then $29 USDC on Solana. No card. No KYC.
        </p>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight md:text-3xl">
          About three minutes
        </h2>
        <p className="mt-2 max-w-[52ch] text-muted">
          From an agent that pays to a connected check to a free trial to a human unlock. External
          audit for your agents.
        </p>
        <ConnectSteps className="mt-8 space-y-3" />

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Call the same check</h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            One check: <code className="font-mono text-fg">{CONNECT_CHECK_PATH}</code>. MCP tool{" "}
            <code className="font-mono text-fg">{CONNECT_MCP_TOOL}</code> is the same call. Adapters
            wrap it so you do not write fetch yourself.
          </p>
          <p className="mt-3 text-sm text-muted">POST {CONNECT_CHECK_PATH}:</p>
          <CopyCode code={CONNECT_CHECK_CODE} label="Copy" />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium">AgentKit</h2>
          <p className="mt-2 text-sm text-muted">
            Pass the policy helper so they ask before they pay. You keep the keys.
          </p>
          <CopyCode code={CONNECT_AGENTKIT_CODE} label="Copy" />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium">x402</h2>
          <p className="mt-2 text-sm text-muted">
            Run the same check before money moves. Copy{" "}
            <code className="font-mono text-fg">src/adapters</code> from the repo.
          </p>
          <CopyCode code={CONNECT_X402_CODE} label="Copy" />
        </section>

        <p className="mt-8 text-sm leading-relaxed text-muted">
          If the check says stop, do not send. If the agent skips the check, Inbox cannot stop that
          send. More detail:{" "}
          <a href="/docs#connect-agentkit" className="font-medium text-navy hover:text-coral">
            docs
          </a>{" "}
          and{" "}
          <a href="/docs#adapters" className="font-medium text-navy hover:text-coral">
            adapters
          </a>
          .
        </p>

        <div className="mt-10">
          <ConnectCtas />
        </div>
      </main>
    </SkyShell>
  );
}
