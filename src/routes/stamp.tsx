import { createFileRoute } from "@tanstack/react-router";
import { CopyCode } from "@/components/copy-code";
import { SkyShell } from "@/components/marketing/chrome";
import { SupportedChains } from "@/components/chain-icons";
import {
  METER_DOCS_HREF,
  METER_LLMS_HREF,
  METER_PACKS,
  METER_QUESTION,
  STAMP_DOCS_HREF,
  STAMP_SELLER_BODY,
  STAMP_SELLER_EYEBROW,
  STAMP_SELLER_HEADLINE,
  STAMP_SELLER_LEDE,
  STAMP_SELLER_STEPS,
  STAMP_VERIFY_CURL,
} from "@/lib/meter-recipe";

export const Route = createFileRoute("/stamp")({
  component: StampSellerPage,
  head: () => ({
    meta: [
      { title: `${STAMP_SELLER_HEADLINE} — Agent Control` },
      {
        name: "description",
        content: `${STAMP_SELLER_LEDE} ${STAMP_SELLER_HEADLINE}`,
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: `${STAMP_SELLER_HEADLINE} — Agent Control` },
      {
        property: "og:description",
        content: STAMP_SELLER_LEDE,
      },
    ],
  }),
});

function StampSellerPage() {
  return (
    <SkyShell>
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">
          {STAMP_SELLER_EYEBROW}
        </p>
        <h1 className="mt-3 text-display font-semibold">{STAMP_SELLER_HEADLINE}</h1>
        <p className="mt-4 max-w-[46ch] text-card text-muted">{STAMP_SELLER_LEDE}</p>
        <p className="mt-3 max-w-[52ch] text-body text-muted">{STAMP_SELLER_BODY}</p>
        <p className="mt-3 max-w-[52ch] text-body text-muted">
          {METER_QUESTION} First 5 free. {METER_PACKS}
        </p>
        <SupportedChains className="mt-5" />

        <ol className="mt-10 space-y-3">
          {STAMP_SELLER_STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
            >
              <p className="font-mono text-meta text-navy">{step.n}</p>
              <h2 className="mt-3 text-card font-medium">{step.t}</h2>
              <p className="mt-1 text-body text-muted">{step.d}</p>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-body text-muted">
          MCP:{" "}
          <code className="font-mono text-fg">meter_stamp</code>,{" "}
          <code className="font-mono text-fg">meter_verify_stamp</code>.
        </p>
        <CopyCode code={STAMP_VERIFY_CURL} label="Copy verify" />

        <p className="mt-6 text-body leading-relaxed text-muted">
          <a href={STAMP_DOCS_HREF} className="font-medium text-navy hover:text-coral">
            Docs
          </a>
          {" · "}
          <a href={METER_DOCS_HREF} className="font-medium text-navy hover:text-coral">
            Agent Meter
          </a>
          {" · "}
          <a href={METER_LLMS_HREF} className="font-medium text-navy hover:text-coral">
            llms.txt
          </a>
          {" · "}
          <a href="/connect#stamp" className="font-medium text-navy hover:text-coral">
            Connect
          </a>
        </p>
      </main>
    </SkyShell>
  );
}
