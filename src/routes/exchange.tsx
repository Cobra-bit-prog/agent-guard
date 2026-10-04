import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";

export const Route = createFileRoute("/exchange")({
  component: ExchangePage,
  head: () => ({
    meta: [
      { title: "Job board opens soon — Agent Control" },
      {
        name: "description",
        content: "Job board opens soon. Looking for work? Same list.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Job board opens soon — Agent Control" },
      {
        property: "og:description",
        content: "Job board opens soon. Looking for work? Same list.",
      },
    ],
  }),
});

function ExchangePage() {
  return (
    <SkyShell>
      <main className="landing-hero">
        <div className="hero-stage mx-auto w-full max-w-[1140px] px-5 md:px-6">
          <div className="max-w-[36rem]">
            <h1 className="text-display font-semibold text-balance text-fg">Job board opens soon.</h1>
            <p className="mt-6 max-w-[36ch] text-body leading-snug text-muted">
              Looking for work? Same list.
            </p>
          </div>
        </div>
      </main>
    </SkyShell>
  );
}
