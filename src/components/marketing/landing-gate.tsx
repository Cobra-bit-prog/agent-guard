export function LandingGate() {
  return (
    <section id="sellers" className="border-t border-border">
      <div className="mx-auto max-w-[1140px] px-5 py-16 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-navy">
          New · if agents pay you
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl">
          Take money only from agents under a spend limit.
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          You keep your own checkout. We only answer: is this agent capped, and does a human see
          new addresses?
        </p>
        <blockquote className="mt-6 max-w-2xl rounded-[20px] border border-border bg-surface p-5 text-sm leading-relaxed">
          Pays only if the agent is capped. You keep the keys. Agent Control checks the cap before
          we take USDC.
        </blockquote>
      </div>
    </section>
  );
}
