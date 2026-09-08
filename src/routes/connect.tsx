import { createFileRoute } from "@tanstack/react-router";
import { CopyCode } from "@/components/copy-code";
import { SkyShell } from "@/components/marketing/chrome";
import { ConnectCtas, ConnectSteps } from "@/components/marketing/connect-path";
import { SupportedChains } from "@/components/chain-icons";
import {
  CONNECT_AGENTKIT_CODE,
  CONNECT_BUILDERS_HEADING,
  CONNECT_BUILDERS_LEDE,
  CONNECT_CHECK_CODE,
  CONNECT_EYEBROW,
  CONNECT_HEADLINE,
  CONNECT_HOW_HEADING,
  CONNECT_HOW_LEDE,
  CONNECT_LEDE,
  CONNECT_STARTER_LINE,
  CONNECT_X402_CODE,
} from "@/lib/connect-path";

export const Route = createFileRoute("/connect")({
  component: ConnectPage,
  head: () => ({
    meta: [
      { title: "Connect your agent — Agent Control" },
      {
        name: "description",
        content:
          "Connect your agent. They ask before they pay. You keep the keys. 1-day trial, then Pay $29 USDC on Solana. No card. No KYC.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Connect your agent — Agent Control" },
      {
        property: "og:description",
        content:
          "They ask before they pay. You keep the keys. Start a 1-day trial. Then Pay $29.",
      },
    ],
  }),
});

function ConnectPage() {
  return (
    <SkyShell current="connect">
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-coral">
          {CONNECT_EYEBROW}
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
          {CONNECT_HOW_HEADING}
        </h2>
        <p className="mt-2 max-w-[52ch] text-muted">{CONNECT_HOW_LEDE}</p>
        <ConnectSteps className="mt-8 space-y-3" />

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">{CONNECT_BUILDERS_HEADING}</h2>
          <p className="mt-3 max-w-[52ch] text-muted">{CONNECT_BUILDERS_LEDE}</p>
          <p className="mt-3 text-sm text-muted">Direct call:</p>
          <CopyCode code={CONNECT_CHECK_CODE} label="Copy" />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium">AgentKit</h2>
          <p className="mt-2 text-sm text-muted">
            Works with AgentKit, a popular agent payment tool. They ask before they pay. You keep
            the keys.
          </p>
          <CopyCode code={CONNECT_AGENTKIT_CODE} label="Copy" />
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-medium">x402</h2>
          <p className="mt-2 text-sm text-muted">
            Works with x402, a popular agent payment tool. Before it sends, it asks Agent Control.
            Copy <code className="font-mono text-fg">src/adapters</code> from the repo.
          </p>
          <CopyCode code={CONNECT_X402_CODE} label="Copy" />
        </section>

        <p className="mt-8 text-sm leading-relaxed text-muted">
          If we say stop, it does not send. If the agent skips the ask, Inbox cannot stop that send.
          More detail:{" "}
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
