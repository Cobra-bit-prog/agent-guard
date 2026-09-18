import { createFileRoute } from "@tanstack/react-router";
import { SpendAuditPayCard } from "@/components/spend-audit-pay-card";
import { parseMeterPaySearch, type MeterPaySearch } from "@/lib/meter-pay";
import { SPEND_AUDIT_HEADLINE, SPEND_AUDIT_HONESTY, SPEND_AUDIT_PRICE_USD, SPEND_AUDIT_PRODUCT, SPEND_AUDIT_SCANNER } from "@/lib/spend-audit";

export const Route = createFileRoute("/spend-audit/pay")({
  validateSearch: (search: Record<string, unknown>): MeterPaySearch => parseMeterPaySearch(search),
  component: SpendAuditPayPage,
  head: () => ({
    meta: [
      { title: `Pay $${SPEND_AUDIT_PRICE_USD} USDC — ${SPEND_AUDIT_PRODUCT}` },
      {
        name: "description",
        content: `Pay $${SPEND_AUDIT_PRICE_USD} USDC. ${SPEND_AUDIT_HEADLINE}. ${SPEND_AUDIT_HONESTY} ${SPEND_AUDIT_SCANNER}`,
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: `Pay $${SPEND_AUDIT_PRICE_USD} USDC — ${SPEND_AUDIT_PRODUCT}` },
      {
        property: "og:description",
        content: `${SPEND_AUDIT_HEADLINE}. $${SPEND_AUDIT_PRICE_USD} USDC. ${SPEND_AUDIT_HONESTY} ${SPEND_AUDIT_SCANNER}`,
      },
    ],
  }),
});

function SpendAuditPayPage() {
  const search = Route.useSearch();
  return (
    <main className="mx-auto max-w-lg px-6 pb-20 pt-8 md:px-10">
      <SpendAuditPayCard search={search} />
    </main>
  );
}
