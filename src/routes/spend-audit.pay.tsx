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
        content: "Pay $49 USDC for a Wallet Spend Audit. Base EIP-3009 or Solana Pay. You keep the keys.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Pay $49 USDC — Wallet Spend Audit" },
      {
        property: "og:description",
        content: `${SPEND_AUDIT_HEADLINE}. Pay $49 USDC. We unlock the PDF when it lands.`,
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
