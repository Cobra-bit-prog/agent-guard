import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import {
  HIRE_PACKAGES,
  HIRE_SUPPORT_EMAIL,
  formatHirePrice,
  isHirePackageId,
  type HirePackageId,
} from "@/lib/hire/packages";

const PAGE_TITLE = "Hire us — Agent Control";
const PAGE_DESCRIPTION =
  "Fixed packages from Agent Control. Agent directory boost $49, Job pack (5 posts) $79, Action Gate setup $149, Outreach kit $199, Done-for-you sprint (1 week) $499.";

export const Route = createFileRoute("/hire/")({
  validateSearch: (search: Record<string, unknown>): { package?: HirePackageId } => {
    const id = typeof search.package === "string" ? search.package : "";
    return isHirePackageId(id) ? { package: id } : {};
  },
  component: HirePage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: "https://agent-control.net/hire" },
    ],
  }),
});

const inputClass = "rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg";

function supportMailto(input: {
  packageName: string;
  name: string;
  email: string;
  brief: string;
  link: string;
}): string {
  const lines = [
    `Package: ${input.packageName}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.link.trim() ? `Link: ${input.link.trim()}` : "",
    "",
    input.brief,
  ].filter((line) => line !== "");
  const subject = `Hire us — ${input.packageName}`;
  return `mailto:${HIRE_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function HirePage() {
  const search = Route.useSearch();
  const [selected, setSelected] = useState<HirePackageId | null>(search.package ?? null);
  const [card, setCard] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brief, setBrief] = useState("");
  const [link, setLink] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (search.package) setSelected(search.package);
  }, [search.package]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/hire");
        const body = (await response.json()) as { card?: boolean };
        if (!cancel && response.ok) setCard(Boolean(body.card));
      } catch {
        if (!cancel) setCard(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const pack = HIRE_PACKAGES.find((item) => item.id === selected) ?? null;

  function choose(id: HirePackageId) {
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
      const response = await fetch("/api/v1/hire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          package: pack.id,
          name,
          email,
          brief,
          link,
          company_website: companyWebsite,
        }),
      });
      const body = (await response.json()) as {
        mode?: "checkout" | "request";
        url?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Could not send this request.");
      if (body.mode === "checkout" && body.url) {
        window.location.assign(body.url);
        return;
      }
      window.location.assign("/hire/thanks?request=1");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send this request.");
      setPending(false);
    }
  }

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[1140px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="landing-rise text-display font-semibold text-balance text-fg">Hire us</h1>
        <p
          className="landing-rise mt-4 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.08s" }}
        >
          Fixed packages from Agent Control. After you pay, our team does the work.
        </p>
        <p
          className="landing-rise mt-2 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.16s" }}
        >
          This is not the free job board. Paying through Agent Control for jobs on the board is not
          switched on. You still pay a worker directly when you say that work is done.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HIRE_PACKAGES.map((item) => {
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
                    {formatHirePrice(item.priceUsd)}
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
                    {card ? "Buy" : "Request"}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>

        <section id="request" className="market-reveal mt-12 max-w-[36rem] scroll-mt-6">
          <h2 className="text-title font-semibold text-fg">Tell us the job</h2>
          <p className="mt-2 text-body text-muted">
            {pack
              ? `${pack.name} · ${formatHirePrice(pack.priceUsd)}`
              : "Pick a package above, then send a short brief."}
          </p>
          <p className="mt-2 text-body text-muted">We'll reply within 1 business day.</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Your name
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
                name="name"
                autoComplete="name"
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
              What you need
              <textarea
                className={`min-h-32 ${inputClass}`}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                maxLength={2000}
                required
                name="brief"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Link
              <input
                className={inputClass}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                maxLength={500}
                name="link"
                inputMode="url"
                placeholder="https://"
              />
              <span className="text-meta text-muted">Optional. https only.</span>
            </label>
            <div className="absolute left-0 top-0 -z-10 h-px w-px overflow-hidden" aria-hidden="true">
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
                      name,
                      email,
                      brief,
                      link,
                    })}
                  >
                    Email {HIRE_SUPPORT_EMAIL}
                  </a>
                ) : null}
              </p>
            ) : null}
            <button
              className="market-press mt-2 w-fit rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60"
              type="submit"
              disabled={pending || !pack}
            >
              {pending
                ? "Sending…"
                : pack
                  ? card
                    ? `Pay ${formatHirePrice(pack.priceUsd)}`
                    : "Send request"
                  : "Pick a package"}
            </button>
          </form>
          <p className="mt-4 text-meta text-muted">
            Questions?{" "}
            <a className="text-fg underline" href={`mailto:${HIRE_SUPPORT_EMAIL}`}>
              {HIRE_SUPPORT_EMAIL}
            </a>
          </p>
          {card ? (
            <p className="mt-2 text-meta text-muted">You pay on a secure checkout page.</p>
          ) : (
            <p className="mt-2 text-meta text-muted">
              Card checkout is off until it is connected. Send the request and we will reply within
              1 business day. Nothing is charged from this form.
            </p>
          )}
        </section>
      </main>
    </SkyShell>
  );
}
