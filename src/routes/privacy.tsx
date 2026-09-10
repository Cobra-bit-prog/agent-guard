import { createFileRoute } from "@tanstack/react-router";
import { SkyShell, SUPPORT_MAIL } from "@/components/marketing/chrome";
import {
  PRIVACY_BODY,
  PRIVACY_CONTACT,
  PRIVACY_EYEBROW,
  PRIVACY_HEADLINE,
  PRIVACY_KEEP_HEADING,
  PRIVACY_LEDE,
  SUPPORT_EMAIL,
} from "@/lib/oauth/copy";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy — Agent Control" },
      {
        name: "description",
        content:
          "We do not hold your keys. We do not sell your data. You stay the customer of record. Questions: support@agent-control.net.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Privacy — Agent Control" },
      {
        property: "og:description",
        content: "We do not hold your keys. We do not sell your data.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <SkyShell>
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">
          {PRIVACY_EYEBROW}
        </p>
        <h1 className="mt-3 text-display font-semibold">{PRIVACY_HEADLINE}</h1>
        <p className="mt-4 max-w-[54ch] text-card text-muted">{PRIVACY_LEDE}</p>
        <h2 className="mt-10 text-title font-semibold tracking-tight">{PRIVACY_KEEP_HEADING}</h2>
        <p className="mt-4 max-w-[54ch] text-body text-muted">{PRIVACY_BODY}</p>
        <p className="mt-6 max-w-[54ch] text-body text-muted">
          {PRIVACY_CONTACT.split(SUPPORT_EMAIL)[0]}
          <a href={SUPPORT_MAIL} className="font-medium text-navy hover:text-coral">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </main>
    </SkyShell>
  );
}
