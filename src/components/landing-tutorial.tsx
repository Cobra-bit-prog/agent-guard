import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SCENES = [
  {
    id: "signup",
    title: "Create an account",
    ms: 5200,
    caption: "Email and a password. We send a confirmation link. Click it, then you land in the dashboard.",
  },
  {
    id: "wallet",
    title: "Enroll a wallet",
    ms: 5200,
    caption: "Paste a live Solana, Ethereum, or Base address. We sync balance and recent transfers.",
  },
  {
    id: "policy",
    title: "Set the limits",
    ms: 5200,
    caption: "Daily cap, max size, hourly velocity, allowlists. You still hold the keys.",
  },
  {
    id: "hook",
    title: "Wire the pre-sign hook",
    ms: 5600,
    caption: "The agent must POST /api/v1/check before it signs. If must_abort is true, it must not send.",
  },
  {
    id: "block",
    title: "Watch a bad send stop",
    ms: 5600,
    caption: "Treasury Bot tries $2,400. Over the daily cap. Check returns must_abort: true.",
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
          Learn how to use it
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Forty seconds. Account, wallet, policy, hook, then a blocked send.
        </p>

        <div className="mt-8 overflow-hidden rounded-[22px] border border-border bg-[#0c1118] shadow-[var(--shadow-panel)]">
          <div className="relative aspect-[16/10] min-h-[280px] md:aspect-[16/9]">
            <SceneFrame id={scene.id} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-14 pt-16">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-warning">
                {String(index + 1).padStart(2, "0")} · {scene.title}
              </p>
              <p className="mt-2 max-w-xl text-sm text-white/90 md:text-base">
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
            <div className="rounded-lg border border-white/10 px-3 py-2">••••••••</div>
            <div className="rounded-lg bg-primary px-3 py-2 text-center font-medium text-black">
              Create account
            </div>
            <p>Confirmation link sent. Click it to continue.</p>
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
          <p className="mt-3 font-mono text-xs text-white/70">
            Solana · 7nYq…kP3d
          </p>
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
          </dl>
        </div>
      </div>
    );
  }
  if (id === "hook") {
    return (
      <div className="grid h-full place-items-center px-6">
        <pre className="w-full max-w-lg overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-mono text-[12px] leading-relaxed text-white/70">
          <span className="text-white/40">POST /api/v1/check</span>
          {"\n"}
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
        <pre className="mt-4 font-mono text-xs text-red-200">{`← { "must_abort": true }  · over daily cap`}</pre>
      </div>
    </div>
  );
}
