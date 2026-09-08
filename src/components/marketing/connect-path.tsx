import { Button } from "@/components/ui/button";
import {
  CONNECT_PAY_CTA,
  CONNECT_PAY_HREF,
  CONNECT_STEPS,
  CONNECT_TRIAL_CTA,
  CONNECT_TRIAL_HREF,
} from "@/lib/connect-path";

export function ConnectCtas({
  size = "lg",
}: {
  size?: "default" | "lg";
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size={size} asChild className="rounded-full">
        <a href={CONNECT_TRIAL_HREF}>
          {CONNECT_TRIAL_CTA}
          <span aria-hidden>→</span>
        </a>
      </Button>
      <Button size={size} variant="secondary" asChild className="rounded-full">
        <a href={CONNECT_PAY_HREF}>{CONNECT_PAY_CTA}</a>
      </Button>
    </div>
  );
}

export function ConnectSteps({
  className = "mt-8 grid gap-4 md:grid-cols-4",
}: {
  className?: string;
}) {
  return (
    <ol className={className}>
      {CONNECT_STEPS.map((step) => (
        <li
          key={step.n}
          className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
        >
          <p className="font-mono text-meta text-navy">{step.n}</p>
          <h3 className="mt-3 text-card font-medium">{step.t}</h3>
          <p className="mt-1 text-body text-muted">{step.d}</p>
        </li>
      ))}
    </ol>
  );
}
