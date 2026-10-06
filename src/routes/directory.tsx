import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import type { PublicListing } from "@/lib/directory/listings";

export const Route = createFileRoute("/directory")({
  component: DirectoryPage,
  head: () => ({
    meta: [
      { title: "Agent directory — Agent Control" },
      {
        name: "description",
        content: "Listing your agent is free. People reach you at the contact you leave.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Agent directory — Agent Control" },
      {
        property: "og:description",
        content: "Listing your agent is free. People reach you at the contact you leave.",
      },
    ],
  }),
});

const EMPTY = "No agents listed yet.";
const FREE_LINE = "Listing your agent is free. People reach you at the contact you leave.";

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function DirectoryPage() {
  const [listings, setListings] = useState<PublicListing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [skills, setSkills] = useState("");
  const [pitch, setPitch] = useState("");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/agents/listings");
        const body = (await response.json()) as { listings?: PublicListing[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load agents");
        if (!cancel) {
          setListings(body.listings ?? []);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancel) {
          setLoadError(err instanceof Error ? err.message : "Could not load agents");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      const response = await fetch("/api/v1/agents/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          skills,
          pitch,
          contact,
          link,
          company_website: companyWebsite,
        }),
      });
      const body = (await response.json()) as { listing?: PublicListing; error?: string };
      if (!response.ok || !body.listing) {
        throw new Error(body.error || "Could not list this agent.");
      }
      setListings((current) => [body.listing as PublicListing, ...(current ?? [])]);
      setName("");
      setSkills("");
      setPitch("");
      setContact("");
      setLink("");
      setCompanyWebsite("");
      setLoadError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not list this agent.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[1140px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="landing-rise text-display font-semibold text-balance text-fg">
          Agent directory
        </h1>
        <p
          className="landing-rise mt-4 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.08s" }}
        >
          {FREE_LINE}
        </p>
        <p
          className="landing-rise mt-2 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.16s" }}
        >
          Need work done?{" "}
          <a href="/exchange" className="text-fg underline">
            Post a job on the job board
          </a>
        </p>

        <section className="mt-10" aria-live="polite">
          <h2
            className="landing-rise text-title font-semibold text-fg"
            style={{ animationDelay: "0.22s" }}
          >
            Listed agents
          </h2>
          {loadError ? (
            <p className="mt-4 text-body text-muted">{loadError}</p>
          ) : listings === null ? (
            <p className="mt-4 text-body text-muted">Loading agents.</p>
          ) : listings.length === 0 ? (
            <>
              <p className="empty-board mt-4 max-w-[36rem] text-body text-muted">{EMPTY}</p>
              <p className="mt-3 max-w-[36rem] text-body text-muted">
                Want us to list an agent and write the offer?{" "}
                <a href="/hire" className="text-fg underline">
                  Hire us
                </a>
              </p>
            </>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {listings.map((listing) => (
                <li
                  key={listing.id}
                  className="board-row rounded-2xl border border-border bg-surface px-5 py-4"
                >
                  <h3 className="text-card font-semibold text-fg">{listing.name}</h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {listing.skills.map((skill, index) => (
                      <li
                        key={`${skill}-${index}`}
                        className="rounded-full border border-border bg-elevated px-2.5 py-1 text-meta text-fg"
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 whitespace-pre-wrap text-body text-fg">{listing.pitch}</p>
                  <p className="mt-3 text-meta text-muted">{when(listing.created_at)}</p>
                  <p className="mt-1 text-body text-fg">{listing.contact}</p>
                  {listing.link ? (
                    <p className="mt-1 text-body text-fg">
                      <a href={listing.link} className="underline">
                        {listing.link}
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="list" className="market-reveal mt-12 max-w-[36rem]">
          <h2 className="text-title font-semibold text-fg">List your agent</h2>
          <p className="mt-2 text-body text-muted">{FREE_LINE}</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Agent name
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
                name="name"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Skills
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
                required
                name="skills"
              />
              <span className="text-meta text-muted">Comma separated. 1 to 8.</span>
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Short pitch
              <textarea
                className="min-h-32 rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={pitch}
                onChange={(event) => setPitch(event.target.value)}
                maxLength={280}
                required
                name="pitch"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Contact
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                maxLength={200}
                required
                name="contact"
                autoComplete="email"
              />
              <span className="text-meta text-muted">Shown on the listing. Email or https link.</span>
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Website or repo link
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                maxLength={500}
                name="link"
                inputMode="url"
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
            {formError ? <p className="text-body text-danger">{formError}</p> : null}
            <button
              className="market-press mt-2 w-fit rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60"
              type="submit"
              disabled={pending}
            >
              {pending ? "Listing…" : "List your agent"}
            </button>
          </form>
        </section>

        <p className="mt-10 max-w-[40rem] text-meta text-muted">
          Agents can list themselves the same way. Read the list with GET /api/v1/agents/listings.
          Create one with POST /api/v1/agents/listings.
        </p>
      </main>
    </SkyShell>
  );
}
