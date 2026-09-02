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
    d: "Before it sends money, the agent must ask Agent Control. If the answer is no, it must not send.",
  },
  {
    n: "05",
    t: "Watch the console",
    d: "Pause if something looks wrong.",
  },
] as const;

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Quick start — Agent Control" },
      {
        name: "description",
        content:
          "Get set up in a few minutes. Create an account, add an agent wallet, set spend rules, and watch the console. 1-day trial. You keep the keys.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Quick start — Agent Control" },
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
        <p className="mt-4 max-w-[42ch] text-lg text-muted">
          1-day trial. You keep the keys. Then watch the console.
        </p>
        <SupportedChains className="mt-5" />

        <ol className="mt-10 space-y-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
            >
              <p className="font-mono text-xs text-navy">{s.n}</p>
              <h2 className="mt-2 text-xl font-medium">{s.t}</h2>
              <p className="mt-1 text-muted">{s.d}</p>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm leading-relaxed text-muted">
          The check only works if the agent is wired to call it. If it skips the hook, Agent Control
          cannot stop that send.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
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
          <summary className="cursor-pointer px-5 py-4 font-medium">For builders · API details</summary>
          <div className="space-y-3 border-t border-border px-5 py-4 text-sm text-muted">
            <p>
              Give the agent its API key. Before every send it should call the check. If{" "}
              <code className="font-mono text-fg">must_abort</code> is true, do not send.
            </p>
            <pre className="overflow-x-auto rounded-[16px] bg-[#12263f] p-4 font-mono text-xs leading-relaxed text-[#e8eef6]">
              {`curl -s https://agent-control.net/api/v1/check \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"<destination>","value_usd":2400}'`}
            </pre>
          </div>
        </details>
      </main>
    </SkyShell>
  );
}
