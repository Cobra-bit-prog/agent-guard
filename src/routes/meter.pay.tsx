import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import { MeterPayCard } from "@/components/meter-pay-card";
import { parseMeterPaySearch, type MeterPaySearch } from "@/lib/meter-pay";
import { METER_LOOK_USD_LABEL, METER_LOOKS_20_USD_LABEL } from "@/lib/meter/pricing";

export const Route = createFileRoute("/meter/pay")({
  validateSearch: (search: Record<string, unknown>): MeterPaySearch => parseMeterPaySearch(search),
  component: MeterPayPage,
  head: () => ({
    meta: [
      { title: `Pay ${METER_LOOKS_20_USD_LABEL} USDC — Agent Control` },
      {
        name: "description",
        content: `Pay ${METER_LOOKS_20_USD_LABEL} USDC on Solana with Phantom. A 20-look pack. One look is $${METER_LOOK_USD_LABEL} if you want it. Laptop page — no QR scan required.`,
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: `Pay ${METER_LOOKS_20_USD_LABEL} USDC — Agent Control` },
      {
        property: "og:description",
        content: `Pay ${METER_LOOKS_20_USD_LABEL} USDC on Solana with Phantom. We unlock when it lands. One look is $${METER_LOOK_USD_LABEL} if you want it.`,
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
