import { createFileRoute } from "@tanstack/react-router";
import { SpendAuditPayCard } from "@/components/spend-audit-pay-card";
import { parseMeterPaySearch, type MeterPaySearch } from "@/lib/meter-pay";
import { SPEND_AUDIT_HEADLINE } from "@/lib/spend-audit";

export const Route = createFileRoute("/spend-audit/pay")({
  validateSearch: (search: Record<string, unknown>): MeterPaySearch => parseMeterPaySearch(search),
  component: SpendAuditPayPage,
  head: () => ({
    meta: [
      { title: "Pay $49 USDC — Wallet Spend Audit" },
      {
        name: "description",
        content: "Pay $49 USDC. External audit for your agents. You keep the keys. Not a package scanner.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Pay $49 USDC — Wallet Spend Audit" },
      {
        property: "og:description",
        content: `${SPEND_AUDIT_HEADLINE}. They ask before they pay. You keep the keys. $49 USDC. Not a package scanner.`,
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
