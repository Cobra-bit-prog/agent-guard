import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import { MeterPayCard } from "@/components/meter-pay-card";
import { parseMeterPaySearch, type MeterPaySearch } from "@/lib/meter-pay";

export const Route = createFileRoute("/meter/pay")({
  validateSearch: (search: Record<string, unknown>): MeterPaySearch => parseMeterPaySearch(search),
  component: MeterPayPage,
  head: () => ({
    meta: [
      { title: "Pay 0.02 USDC — Agent Control" },
      {
        name: "description",
        content: "Pay 0.02 USDC on Solana with Phantom. Laptop page — no QR scan required.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Pay 0.02 USDC — Agent Control" },
      {
        property: "og:description",
        content: "Pay 0.02 USDC on Solana with Phantom. We unlock when it lands.",
      },
    ],
  }),
});

function MeterPayPage() {
  const search = Route.useSearch();
  return (
    <SkyShell>
      <main className="mx-auto max-w-lg px-6 pb-20 pt-8 md:px-10">
        <MeterPayCard search={search} />
      </main>
    </SkyShell>
  );
}
