import { useState } from "react";

type CatchStep = "idle" | "wait12" | "allowed" | "blocked" | "wait2400";

const CATCH_LOG: Record<CatchStep, string> = {
  idle: "Tap Go. The agent tries to pay a license fee.",
  wait12: "Wants $12 · new address\nWaiting on you\n$12 would leave.",
  allowed: "Allowed this once.\nNext time this address waits again.",
  blocked: "Stopped. $12 did not leave.",
  wait2400: "Trade Agent Alpha · Tuesday\nWants $2,400 · new address\nWaiting on you",
};

const ACTION_BTN =
  "inline-flex h-10 items-center rounded-full px-4 text-body font-semibold";

export function LandingCatch() {
  const [step, setStep] = useState<CatchStep>("idle");

  return (
    <section id="catch" className="border-t border-border">
      <div className="mx-auto grid max-w-[1140px] items-center gap-8 px-5 py-16 md:grid-cols-2 md:px-6">
        <div>
          <p className="text-meta font-semibold uppercase tracking-[0.16em] text-navy">New</p>
          <h2 className="mt-2 text-title font-semibold tracking-tight">
            A new address waits on you.
          </h2>
          <p className="mt-2 max-w-[42ch] text-body text-muted">
            The agent wants to pay. You have not seen this address. Money does not leave until you
            tap.
          </p>
          <p className="mt-3 text-meta text-subtle">Example only. No real money moves.</p>
        </div>
        <div className="rounded-[20px] border border-border bg-surface p-[22px] shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
          <p className="text-meta text-muted">Research agent · $80 per pay · $400 a day</p>
          <pre
            aria-live="polite"
            className="mt-4 min-h-[6.5em] whitespace-pre-wrap font-mono text-meta leading-relaxed text-fg"
          >
            {CATCH_LOG[step]}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            {step === "idle" ? (
              <button
                type="button"
                className={`${ACTION_BTN} bg-primary text-primary-fg`}
                onClick={() => setStep("wait12")}
              >
                Go
              </button>
            ) : null}
            {step === "wait12" || step === "wait2400" ? (
              <>
                <button
                  type="button"
                  className={`${ACTION_BTN} bg-primary text-primary-fg`}
                  onClick={() => setStep("allowed")}
                >
                  Allow once
                </button>
                <button
                  type="button"
                  className={`${ACTION_BTN} border border-border bg-white text-fg`}
                  onClick={() => setStep("blocked")}
                >
                  Block
                </button>
              </>
            ) : null}
            {step === "allowed" || step === "blocked" ? (
              <>
                <button
                  type="button"
                  className={`${ACTION_BTN} bg-primary text-primary-fg`}
                  onClick={() => setStep("wait2400")}
                >
                  See the $2,400 one
                </button>
                <button
                  type="button"
                  className={`${ACTION_BTN} border border-border bg-white text-fg`}
                  onClick={() => setStep("idle")}
                >
                  Again
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
