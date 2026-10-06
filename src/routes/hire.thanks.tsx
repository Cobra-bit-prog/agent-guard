import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import { HIRE_SUPPORT_EMAIL, formatHirePrice } from "@/lib/hire/packages";

export const Route = createFileRoute("/hire/thanks")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { session_id?: string; request?: 1 } => {
    const sessionId = typeof search.session_id === "string" ? search.session_id.trim() : "";
    const request = search.request === 1 || search.request === "1" ? 1 : undefined;
    return {
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(request ? { request } : {}),
    };
  },
  component: HireThanksPage,
  head: () => ({
    meta: [
      { title: "Request received — Hire us — Agent Control" },
      {
        name: "description",
        content: "We received your Hire us request. We'll reply within 1 business day.",
      },
      { name: "theme-color", content: "#eef3f8" },
    ],
  }),
});

function HireThanksPage() {
  const search = Route.useSearch();
  const [state, setState] = useState<"request" | "loading" | "paid" | "error">(
    search.request === 1 && !search.session_id ? "request" : search.session_id ? "loading" : "error",
  );
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.session_id) return;
    let cancel = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/hire/confirm?session_id=${encodeURIComponent(search.session_id ?? "")}`,
        );
        const body = (await response.json()) as {
          package_name?: string;
          amount_usd?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Could not confirm this payment.");
        if (!cancel) {
          const price =
            typeof body.amount_usd === "number" ? formatHirePrice(body.amount_usd) : "";
          setDetail(
            body.package_name
              ? `Paid${price ? ` ${price}` : ""} for ${body.package_name}. Our team will do this work.`
              : "Paid. Our team will do this work.",
          );
          setState("paid");
        }
      } catch (err) {
        if (!cancel) {
          setError(err instanceof Error ? err.message : "Could not confirm this payment.");
          setState("error");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [search.session_id]);

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[1140px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="landing-rise text-display font-semibold text-balance text-fg">
          {state === "paid" ? "Payment received" : state === "error" ? "We need another look" : "Request received"}
        </h1>
        {state === "loading" ? (
          <p className="mt-4 max-w-[40rem] text-body text-muted">Checking your payment.</p>
        ) : null}
        {state === "request" ? (
          <p className="mt-4 max-w-[40rem] text-body text-muted">
            We got your request. We'll reply within 1 business day.
          </p>
        ) : null}
        {state === "paid" ? (
          <>
            <p className="mt-4 max-w-[40rem] text-body text-muted">{detail}</p>
            <p className="mt-2 max-w-[40rem] text-body text-muted">
              We'll reply within 1 business day.
            </p>
          </>
        ) : null}
        {state === "error" ? (
          <p className="mt-4 max-w-[40rem] text-body text-muted">
            {error ?? "Start from the package list."}{" "}
            <a className="text-fg underline" href={`mailto:${HIRE_SUPPORT_EMAIL}`}>
              {HIRE_SUPPORT_EMAIL}
            </a>
          </p>
        ) : null}
        <p className="mt-8 text-body">
          <a className="text-fg underline" href="/hire">
            Back to Hire us
          </a>
        </p>
      </main>
    </SkyShell>
  );
}
