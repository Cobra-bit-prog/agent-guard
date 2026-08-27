import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      "Name the agent, pick Solana, Ethereum, or Base, paste the address, then add the wallet. Live wallets sync. Demo wallets stay labeled so you can tour first.",
  },
  {
    id: "policy",
    title: "Set the limits",
    ms: 7200,
    caption:
      "Fill the policy: daily cap, max send, hourly velocity, and an allowlist if you want only those destinations. Pause holds every send.",
  },
  {
    id: "hook",
    title: "Wire the pre-sign hook",
    ms: 8000,
    caption:
      "Open the agent, copy the API key, paste destination and amount, then run Check before the agent signs.",
  },
  {
    id: "block",
    title: "Watch a bad send stop",
    ms: 6400,
    caption:
      "Treasury Bot tries $2,400 against a $2,000 daily cap. The feed shows Blocked. If the agent can skip the check, pause it in the console.",
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
    body: "Open the agent, copy its API key, and run Simulate a send with the destination and amount before the agent signs. The same key works on REST and MCP. We cannot stop a send the agent never checks. Pause from the console for a hard stop on your side.",
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
          Account, wallet, policy, then the check your agent runs in the console
          before it signs.
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
            <SimulateSendMock />
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

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-white/45">{label}</p>
      <div
        className={cn(
          "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/85",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SimulateSendMock({ dark }: { dark?: boolean }) {
  const box = dark
    ? "rounded-2xl border border-white/10 bg-white/[0.04] p-5"
    : "rounded-[18px] border border-border bg-surface p-5";
  const label = dark ? "text-[11px] text-white/45" : "text-[11px] text-muted";
  const input = dark
    ? "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/85"
    : "rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg";
  const title = dark ? "text-sm font-medium text-white" : "text-sm font-medium";
  const muted = dark ? "text-xs text-white/50" : "text-sm text-muted";
  const btn = dark
    ? "rounded-lg bg-primary px-3 py-2 text-center text-xs font-medium text-black"
    : "rounded-lg bg-primary px-3 py-2 text-center text-xs font-medium text-bg";

  return (
    <div className={box}>
      <p className={dark ? "text-xs font-medium uppercase tracking-[0.16em] text-warning" : "text-xs font-medium uppercase tracking-[0.16em] text-warning"}>
        Agent page
      </p>
      <div className="mt-3 space-y-1">
        <p className={label}>API key</p>
        <div className={cn(input, "flex items-center justify-between gap-2 font-mono")}>
          <span>ag_live_••••••••••••3kP9</span>
          <span className={cn("inline-flex items-center gap-1", dark ? "text-white/50" : "text-muted")}>
            <Copy className="size-3" />
            Copy
          </span>
        </div>
      </div>
      <p className={cn("mt-4", title)}>Simulate a send</p>
      <p className={cn("mt-1", muted)}>
        Your agent uses this check before it signs.
      </p>
      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <p className={label}>To</p>
          <div className={cn(input, "font-mono")}>0x91c4…a2e1</div>
        </div>
        <div className="space-y-1">
          <p className={label}>Amount USD</p>
          <div className={input}>2400</div>
        </div>
        <div className={btn}>Check</div>
      </div>
    </div>
  );
}

function SceneFrame({ id }: { id: SceneId }) {
  if (id === "signup") {
    return (
      <div className="grid h-full place-items-center px-6 pb-24 pt-6">
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
      <div className="grid h-full place-items-center px-6 pb-24 pt-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-medium text-white">Add wallet</p>
          <div className="mt-4 space-y-3">
            <Field label="Agent name" value="Treasury Bot" />
            <div className="space-y-1">
              <p className="text-[11px] text-white/45">Chain</p>
              <div className="flex gap-2 text-[11px] font-medium">
                {["Solana", "Ethereum", "Base"].map((c, i) => (
                  <span
                    key={c}
                    className={cn(
                      "rounded-full border px-3 py-1.5",
                      i === 0
                        ? "border-primary/50 bg-primary/15 text-white"
                        : "border-white/10 text-white/50",
                    )}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <Field label="Address" value="7nYqKs2mR8pQ…kP3d" mono />
            <div className="rounded-lg bg-primary px-3 py-2 text-center text-xs font-medium text-black">
              Add wallet
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (id === "policy") {
    return (
      <div className="grid h-full place-items-center px-6 pb-24 pt-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-sm font-medium text-white">Treasury Bot policy</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Daily cap" value="$2,000" />
            <Field label="Max send" value="$500" />
            <Field label="Hourly velocity" value="4" />
            <div className="space-y-1">
              <p className="text-[11px] text-white/45">Allowlist</p>
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/80">
                  0x91c4…a2e1
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/80">
                  7nYq…kP3d
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (id === "hook") {
    return (
      <div className="grid h-full place-items-center px-6 pb-24 pt-6">
        <div className="w-full max-w-lg">
          <SimulateSendMock dark />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full place-items-center px-6 pb-24 pt-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">Activity</p>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3">
          <span className="mt-0.5 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Blocked
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">Treasury Bot · $2,400</p>
            <p className="mt-1 text-xs text-red-200">Over daily cap of $2,000</p>
          </div>
        </div>
      </div>
    </div>
  );
}
