import { createFileRoute } from "@tanstack/react-router";
import { SkyShell, SUPPORT_MAIL } from "@/components/marketing/chrome";
import {
  FAQ_EYEBROW,
  FAQ_HEADLINE,
  FAQ_ITEMS,
  FAQ_LEDE,
  FAQ_PAGE_DESCRIPTION,
  FAQ_PAGE_TITLE,
  FAQ_SUPPORT_EMAIL,
  type FaqPart,
} from "@/lib/faq-copy";

export const Route = createFileRoute("/faq")({
  component: FaqPage,
  head: () => ({
    meta: [
      { title: FAQ_PAGE_TITLE },
      { name: "description", content: FAQ_PAGE_DESCRIPTION },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: FAQ_PAGE_TITLE },
      { property: "og:description", content: FAQ_PAGE_DESCRIPTION },
      { property: "og:url", content: "https://agent-control.net/faq" },
    ],
  }),
});

function FaqText({ parts }: { parts: readonly FaqPart[] }) {
  return (
    <p className="mt-2 text-body text-muted">
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <a
            key={part.href}
            href={part.href === `mailto:${FAQ_SUPPORT_EMAIL}` ? SUPPORT_MAIL : part.href}
            className="font-medium text-navy hover:text-coral"
          >
            {part.label}
          </a>
        ),
      )}
    </p>
  );
}

function FaqPage() {
  return (
    <SkyShell>
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">{FAQ_EYEBROW}</p>
        <h1 className="mt-3 text-display font-semibold">{FAQ_HEADLINE}</h1>
        <p className="mt-4 max-w-[54ch] text-body text-muted">{FAQ_LEDE}</p>
        <div className="mt-10 divide-y divide-border rounded-[22px] border border-border bg-surface">
          {FAQ_ITEMS.map((item) => (
            <section key={item.q} className="px-5 py-5">
              <h2 className="text-title font-semibold tracking-tight">{item.q}</h2>
              <FaqText parts={item.parts} />
            </section>
          ))}
        </div>
      </main>
    </SkyShell>
  );
}
