import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHECK_CURL = `curl -s https://agent-control.net/api/v1/check \\
  -H "Authorization: Bearer <agent api key>" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"DESTINATION","value_usd":250}'`;

const SCENES = [
  {
    id: "signup",
    title: "Create an account",
    ms: 6400,
    caption:
      "Email and a password (8+ characters). No card. You get one day of the full console. Then open the dashboard.",
  },
  {
    id: "wallet",
    title: "Enroll a wallet",
    ms: 6400,
    caption:
      "Paste a live Solana, Ethereum, or Base address. We sync native balance and recent transfers. Demo wallets stay labeled so you can tour first.",
  },
  {
    id: "policy",
    title: "Set the limits",
    ms: 7200,
    caption:
      "Daily cap, max send, hourly velocity, alert threshold, allowlist, denylist. An allowlist means anything else is blocked. Pause holds every send.",
  },
  {
    id: "hook",
    title: "Wire the pre-sign hook",
    ms: 8000,
    caption:
      "Copy the agent API key. Before every sign, POST /api/v1/check with Bearer auth, destination, and value_usd. If must_abort is true, do not broadcast.",
  },
  {
    id: "block",
    title: "Watch a bad send stop",
    ms: 6400,
    caption:
      "Treasury Bot tries $2,400 against a $2,000 daily cap. Check returns must_abort: true and the reason. If the agent can skip the check, pause it in the console.",
  },
] as const;

const GUIDE = [
  {
    n: "01",
    title: "Create an account",
    body: "Sign up with email and a password of at least 8 characters. No card. The trial is one day of the full console. After it ends, monitoring pauses until you pick a paid plan.",
  },
  {
    n: "02",
    title: "Enroll a wallet",
    body: "Add an agent and paste a live address on Solana, Ethereum, or Base (in that order of support). We pull native balance and recent on-chain transfers. Keep a demo wallet if you want to click around before a live one.",
  },
  {
    n: "03",
    title: "Write the policy",
    body: "These are the knobs that actually run on every check: daily spend cap, max transaction size, hourly velocity, alert threshold, allowlist, denylist. If the allowlist has any address, destinations not on it are blocked. Pause the agent to hold every transfer.",
  },
  {
    n: "04",
    title: "Call check before you sign",
    body: "Open the agent, copy its API key, and put this call in front of sign-and-broadcast. REST and MCP use the same Bearer key. If the JSON has must_abort: true, abort. We cannot stop a send the agent never checks. pause from the console for a hard stop on your side.",
  },
  {
    n: "05",
    title: "Read the verdict",
    body: "A check writes allow, alert, or block plus reasons, and lands in the feed with the audit trail. Simulate a send from the agent page before you wire production. Rotate the key if it leaks.",
  },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

export function LandingTutorial() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scene = SCENES[index];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % SCENES.length);
    }, scene.ms);
    return () => window.clearTimeout(t);
  }, [playing, index, scene.ms]);

  return (
    <section id="learn" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-warning">
          Tutorial
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          From signup to a blocked send
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Account, wallet, policy, then the pre-sign check your agent must call.
          The hook only works if you wire it in front of the signature.
        </p>

        <div className="mt-8 overflow-hidden rounded-[22px] border border-border bg-[#0c1118] shadow-[var(--shadow-panel)]">
          <div className="relative aspect-[16/10] min-h-[280px] md:aspect-[16/9]">
            <SceneFrame id={scene.id} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-14 pt-16">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-warning">
                {String(index + 1).padStart(2, "0")} · {scene.title}
              </p>
              <p className="mt-2 max-w-2xl text-sm text-white/90 md:text-base">
                {scene.caption}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black"
              aria-label={playing ? "Pause tutorial" : "Play tutorial"}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            </button>
            <div className="flex min-w-0 flex-1 gap-1">
              {SCENES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i === index ? "bg-primary" : "bg-white/15",
                  )}
                  aria-label={s.title}
                  onClick={() => {
                    setIndex(i);
                    setPlaying(true);
                  }}
                />
              ))}
            </div>
            <Button size="sm" asChild className="sm:ml-2">
              <Link to="/login">Start 1-day trial</Link>
            </Button>
          </div>
        </div>

        <ol className="mt-6 grid gap-2 sm:grid-cols-5">
          {SCENES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-[14px] border px-3 py-3 text-left",
                  i === index
                    ? "border-primary/40 bg-surface"
                    : "border-border bg-surface/50 text-muted",
                )}
                onClick={() => {
                  setIndex(i);
                  setPlaying(true);
                }}
              >
                <p className="font-mono text-[11px] text-primary">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-1 text-sm font-medium text-fg">{s.title}</p>
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <ol className="space-y-4">
            {GUIDE.map((step) => (
              <li
                key={step.n}
                className="rounded-[18px] border border-border bg-surface p-5"
              >
                <p className="font-mono text-[11px] text-primary">{step.n}</p>
                <h3 className="mt-2 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[18px] border border-border bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-warning">
                Pre-sign check
              </p>
              <p className="mt-2 text-sm text-muted">
                Call this before the agent signs. Same key on REST and MCP
                (`check_transfer`).
              </p>
              <pre className="mt-4 overflow-x-auto rounded-[14px] bg-bg p-4 font-mono text-[11px] leading-relaxed text-muted">
                {CHECK_CURL}
              </pre>
              <p className="mt-3 font-mono text-[11px] text-muted">
                {`← { "must_abort": true, "decision": "block", "reasons": ["…"] }`}
              </p>
            </div>
            <div className="rounded-[18px] border border-border bg-surface p-5">
              <p className="text-sm font-medium">Policy that actually runs</p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>Daily cap · max send · hourly velocity</li>
                <li>Alert threshold (logs, does not abort by itself)</li>
                <li>Allowlist (if set, everything else is blocked)</li>
                <li>Denylist · pause holds every transfer</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SceneFrame({ id }: { id: SceneId }) {
  if (id === "signup") {
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-medium text-white">Create account</p>
          <div className="mt-4 space-y-3 text-xs text-white/50">
            <div className="rounded-lg border border-white/10 px-3 py-2">you@company.com</div>
            <div className="rounded-lg border border-white/10 px-3 py-2">••••••••  8+ characters</div>
            <div className="rounded-lg bg-primary px-3 py-2 text-center font-medium text-black">
              Create account
            </div>
            <p>1-day trial. No card.</p>
          </div>
        </div>
      </div>
    );
  }
  if (id === "wallet") {
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-medium text-white">Enroll agent wallet</p>
          <p className="mt-3 font-mono text-xs text-white/70">Solana · 7nYq…kP3d</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/[0.05] p-3">
              <p className="text-white/40">Native balance</p>
              <p className="mt-1 text-lg text-white">$12,400</p>
            </div>
            <div className="rounded-xl bg-white/[0.05] p-3">
              <p className="text-white/40">Last 24h</p>
              <p className="mt-1 text-lg text-white">$1,080</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-white/40">Also Ethereum and Base. Demo wallets stay labeled.</p>
        </div>
      </div>
    );
  }
  if (id === "policy") {
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-medium text-white">Treasury Bot policy</p>
          <dl className="mt-4 space-y-2 text-sm text-white/80">
            <div className="flex justify-between">
              <dt className="text-white/40">Daily cap</dt>
              <dd>$2,000</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/40">Max send</dt>
              <dd>$500</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/40">Hourly velocity</dt>
              <dd>4</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-white/40">Allowlist</dt>
              <dd className="font-mono text-xs">2 addresses</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }
  if (id === "hook") {
    return (
      <div className="grid h-full place-items-center px-6">
        <pre className="w-full max-w-xl overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-mono text-[11px] leading-relaxed text-white/70">
          <span className="text-white/40">POST /api/v1/check</span>
          {"\n"}
          {`Authorization: Bearer ag_live_…`}
          {"\n\n"}
          {`{ "to": "0x91c4…a2e1", "value_usd": 2400 }`}
        </pre>
      </div>
    );
  }
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-red-300">
          Blocked
        </p>
        <p className="mt-2 text-lg font-medium text-white">Treasury Bot · $2,400</p>
        <pre className="mt-4 whitespace-pre-wrap font-mono text-xs text-red-200">
          {`← { "must_abort": true, "decision": "block" }
   over daily cap of $2000`}
        </pre>
      </div>
    </div>
  );
}
