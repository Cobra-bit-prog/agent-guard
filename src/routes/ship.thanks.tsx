import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import {
  SHIP_CHARGE_LINE,
  SHIP_REFUND_LINE,
  SHIP_REPLY_LINE,
  SHIP_SUPPORT_EMAIL,
} from "@/lib/ship/packages";

export const Route = createFileRoute("/ship/thanks")({
  validateSearch: (search: Record<string, unknown>): { request?: 1 } => {
    const request = search.request === 1 || search.request === "1" ? 1 : undefined;
    return request ? { request } : {};
  },
  component: ShipThanksPage,
  head: () => ({
    meta: [
      { title: "Request received — Ship to paid — Agent Control" },
      {
        name: "description",
        content:
          "We received your Ship to paid request. Nothing is charged from the form. We'll reply within 1 business day with a USDC payment link.",
      },
      { name: "theme-color", content: "#eef3f8" },
    ],
  }),
});

function ShipThanksPage() {
  const search = Route.useSearch();
  const received = search.request === 1;

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[1140px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="landing-rise text-display font-semibold text-balance text-fg">
          {received ? "Request received" : "We need another look"}
        </h1>
        {received ? (
          <>
            <p className="mt-4 max-w-[40rem] text-body text-muted">
              We got your request. {SHIP_CHARGE_LINE}
            </p>
            <p className="mt-2 max-w-[40rem] text-body text-muted">{SHIP_REPLY_LINE}</p>
            <p className="mt-2 max-w-[40rem] text-body text-muted">{SHIP_REFUND_LINE}</p>
          </>
        ) : (
          <p className="mt-4 max-w-[40rem] text-body text-muted">
            Start from the package list.{" "}
            <a className="text-fg underline" href={`mailto:${SHIP_SUPPORT_EMAIL}`}>
              {SHIP_SUPPORT_EMAIL}
            </a>
          </p>
        )}
        <p className="mt-8 text-body">
          <a className="text-fg underline" href="/ship">
            Back to Ship to paid
          </a>
        </p>
      </main>
    </SkyShell>
  );
}
