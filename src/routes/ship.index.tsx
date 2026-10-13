import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import {
  SHIP_CHARGE_LINE,
  SHIP_HONESTY_LINE,
  SHIP_PACKAGES,
  SHIP_PAY_LINE,
  SHIP_SCOPE_LINE,
  SHIP_REPLY_LINE,
  SHIP_SUPPORT_EMAIL,
  formatShipPrice,
  isShipPackageId,
  type ShipPackageId,
} from "@/lib/ship/packages";

const PAGE_TITLE = "Ship to paid — Agent Control";
const PAGE_DESCRIPTION =
  "Fix is $149. Launch is $399. Paid in USDC on Solana or Base. Nothing is charged from the form. We reply within 1 business day with a USDC payment link.";

export const Route = createFileRoute("/ship/")({
  validateSearch: (search: Record<string, unknown>): { package?: ShipPackageId } => {
    const id = typeof search.package === "string" ? search.package : "";
    return isShipPackageId(id) ? { package: id } : {};
  },
  component: ShipPage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: "https://agent-control.net/ship" },
    ],
  }),
});

const inputClass = "rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg";

function supportMailto(input: {
  packageName: string;
  email: string;
  endpoint: string;
  note: string;
}): string {
  const lines = [
    `Package: ${input.packageName}`,
    `Email: ${input.email}`,
    `Endpoint: ${input.endpoint}`,
    "",
    input.note.trim() ? input.note : "(none)",
  ];
  const subject = `Ship to paid — ${input.packageName}`;
  return `mailto:${SHIP_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function ShipPage() {
  const search = Route.useSearch();
  const [selected, setSelected] = useState<ShipPackageId | null>(search.package ?? null);
  const [endpoint, setEndpoint] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (search.package) setSelected(search.package);
  }, [search.package]);

  const pack = SHIP_PACKAGES.find((item) => item.id === selected) ?? null;

  function choose(id: ShipPackageId) {
    setSelected(id);
    setFormError(null);
    document.getElementById("request")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pack) {
      setFormError("Pick a package");
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      const response = await fetch("/api/v1/ship", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          package: pack.id,
          endpoint,
          email,
          note,
          company_website: companyWebsite,
        }),
      });
      const body = (await response.json()) as { mode?: "request"; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not send this request.");
      window.location.assign("/ship/thanks?request=1");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send this request.");
      setPending(false);
    }
  }

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[1140px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="landing-rise text-display font-semibold text-balance text-fg">
          Ship to paid
        </h1>
        <p
          className="landing-rise mt-4 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.08s" }}
        >
          Two fixed packages. {SHIP_PAY_LINE} {SHIP_CHARGE_LINE} {SHIP_REPLY_LINE}
        </p>
        <p
          className="landing-rise mt-2 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.16s" }}
        >
          {SHIP_SCOPE_LINE} {SHIP_HONESTY_LINE}
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {SHIP_PACKAGES.map((item) => {
            const active = item.id === selected;
            return (
              <li key={item.id}>
                <article
                  className={`flex h-full flex-col rounded-[20px] border bg-surface p-5 shadow-panel ${
                    active ? "border-coral" : "border-border"
                  }`}
                >
                  <h2 className="text-card font-medium text-fg">{item.name}</h2>
                  <p className="mt-3 text-title font-semibold text-fg">
                    {formatShipPrice(item.priceUsd)}
                  </p>
                  <p className="mt-2 text-meta text-muted">
                    Delivered within {item.days} business days.
                  </p>
                  <h3 className="mt-4 font-mono text-meta text-coral">Included</h3>
                  <p className="mt-2 flex-1 text-body text-muted">{item.included}</p>
                  <h3 className="mt-4 font-mono text-meta text-muted">Not included</h3>
                  <p className="mt-2 text-body text-muted">{item.excluded}</p>
                  <button
                    type="button"
                    className="market-press mt-5 w-fit rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg"
                    aria-pressed={active}
                    onClick={() => choose(item.id)}
                  >
                    Request
                  </button>
                </article>
              </li>
            );
          })}
        </ul>

        <section id="request" className="market-reveal mt-12 max-w-[36rem] scroll-mt-6">
          <h2 className="text-title font-semibold text-fg">Tell us the endpoint</h2>
          <p className="mt-2 text-body text-muted">
            {pack
              ? `${pack.name} · ${formatShipPrice(pack.priceUsd)}`
              : "Pick a package above, then send the endpoint URL."}
          </p>
          <p className="mt-2 text-body text-muted">{SHIP_REPLY_LINE}</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Endpoint URL
              <input
                className={inputClass}
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                maxLength={500}
                required
                name="endpoint"
                type="url"
                inputMode="url"
                placeholder="https://"
                autoComplete="url"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Email
              <input
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={200}
                required
                type="email"
                name="email"
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Note
              <textarea
                className={`min-h-32 ${inputClass}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                name="note"
              />
              <span className="text-meta text-muted">Optional.</span>
            </label>
            <div
              className="absolute left-0 top-0 -z-10 h-px w-px overflow-hidden"
              aria-hidden="true"
            >
              <label>
                Company website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyWebsite}
                  onChange={(event) => setCompanyWebsite(event.target.value)}
                  name="company_website"
                />
              </label>
            </div>
            {formError ? (
              <p className="text-body text-danger">
                {formError}{" "}
                {pack ? (
                  <a
                    className="text-fg underline"
                    href={supportMailto({
                      packageName: pack.name,
                      email,
                      endpoint,
                      note,
                    })}
                  >
                    Email {SHIP_SUPPORT_EMAIL}
                  </a>
                ) : null}
              </p>
            ) : null}
            <button
              className="market-press mt-2 w-fit rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60"
              type="submit"
              disabled={pending || !pack}
            >
              {pending ? "Sending…" : pack ? "Send request" : "Pick a package"}
            </button>
          </form>
          <p className="mt-4 text-meta text-muted">
            Questions?{" "}
            <a className="text-fg underline" href={`mailto:${SHIP_SUPPORT_EMAIL}`}>
              {SHIP_SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-2 text-meta text-muted">
            {SHIP_CHARGE_LINE} {SHIP_REPLY_LINE} {SHIP_SCOPE_LINE}
          </p>
        </section>
      </main>
    </SkyShell>
  );
}
