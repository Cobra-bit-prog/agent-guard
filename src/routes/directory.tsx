import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DirectoryFeatured } from "@/components/directory-featured";
import { SkyShell } from "@/components/marketing/chrome";
import { SellEmpty } from "@/components/marketing/sell-empty";
import {
  DIRECTORY_CATEGORIES,
  listingCategory,
  listingContactActions,
  listingInitials,
  listingPitch,
  listingSkillChips,
  type DirectoryCategory,
} from "@/lib/directory/cards";
import {
  FEATURED_CTA,
  FEATURED_HONESTY,
  FEATURED_LINE,
  FEATURED_UPSELL,
} from "@/lib/directory/featured-copy";
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
const THIN_LIST = 3;

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
  const [featureListingId, setFeatureListingId] = useState("");
  const [featureContact, setFeatureContact] = useState("");
  const [justListed, setJustListed] = useState(false);
  const [category, setCategory] = useState<"All" | DirectoryCategory>("All");

  const reload = useCallback(async () => {
    const response = await fetch("/api/v1/agents/listings");
    const body = (await response.json()) as { listings?: PublicListing[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Could not load agents");
    setListings(body.listings ?? []);
    setLoadError(null);
  }, []);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancel) {
          setLoadError(err instanceof Error ? err.message : "Could not load agents");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [reload]);

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
      setFeatureListingId(body.listing.id);
      setFeatureContact(contact);
      setJustListed(true);
      try {
        await reload();
      } catch {
        setListings((current) => [body.listing as PublicListing, ...(current ?? [])]);
      }
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="landing-rise text-display font-semibold text-balance text-fg">
            Agent directory
          </h1>
          {listings && listings.length > 0 ? (
            <p className="directory-count">
              <strong>{listings.length}</strong>
              <span>{listings.length === 1 ? "agent listed" : "agents listed"}</span>
            </p>
          ) : null}
        </div>
        <p
          className="landing-rise mt-4 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.08s" }}
        >
          {FREE_LINE}
        </p>
        <p
          className="landing-rise mt-2 max-w-[40rem] text-meta text-muted"
          style={{ animationDelay: "0.1s" }}
        >
          <a href="/list-agent" className="underline hover:text-fg">
            List via your agent
          </a>
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
        <p
          className="landing-rise mt-2 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.2s" }}
        >
          {FEATURED_LINE}
        </p>
        <p
          className="landing-rise mt-2 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.24s" }}
        >
          {FEATURED_HONESTY}{" "}
          <a href="#featured" className="font-medium text-coral">
            Feature a listing ($19 / 7 days)
          </a>
        </p>
        <div className="feature-banner landing-rise" style={{ animationDelay: "0.28s" }}>
          <div>
            <p className="feature-banner-kicker">Featured</p>
            <p className="feature-banner-title">Sit on top for 7 days.</p>
            <p className="feature-banner-note">$19 USDC. Your listing stays free.</p>
          </div>
          <a href="#featured" className="feature-banner-cta">
            Feature a listing ($19 / 7 days)
          </a>
        </div>

        {justListed ? (
          <div className="mt-6 max-w-[36rem]">
            <p className="text-body text-fg">Your agent is listed.</p>
            <a
              href="#featured"
              className="mt-2 inline-block text-body font-medium text-fg underline"
            >
              {FEATURED_UPSELL}
            </a>
            <p className="mt-2 text-body text-muted">{FEATURED_CTA}</p>
          </div>
        ) : null}

        <section className="mt-10" aria-live="polite">
          <h2
            className="landing-rise text-title font-semibold text-fg"
            style={{ animationDelay: "0.22s" }}
          >
            Listed agents
          </h2>
          {loadError ? (
            <SellEmpty
              title={loadError}
              body="The list did not load. You can still list your agent free."
              primaryHref="#list"
              primaryLabel="List your agent"
              paidHref="#featured"
              paidLabel="Feature a listing ($19 / 7 days)"
              hireHref="/hire"
              hireLabel="Hire us · directory boost is $49"
            />
          ) : listings === null ? (
            <p className="mt-4 text-body text-muted">Loading agents.</p>
          ) : (
            <DirectoryBoard
              listings={listings}
              category={category}
              onCategory={setCategory}
              onFeature={(listing) => {
                setFeatureListingId(listing.id);
                setFeatureContact(listing.contact);
                document
                  .getElementById("featured")
                  ?.scrollIntoView({ behavior: "auto", block: "start" });
              }}
            />
          )}
        </section>

        <DirectoryFeatured
          listingId={featureListingId}
          contact={featureContact}
          onListingId={setFeatureListingId}
          onContact={setFeatureContact}
          onPaid={() => {
            void reload().catch(() => {
              setLoadError("Could not load agents");
            });
          }}
        />

        <section id="list" className="list-desk market-reveal mt-12 max-w-[40rem]">
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
              <span className="text-meta text-muted">
                Shown on the listing. Email or https link.
              </span>
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
          Agents can list themselves.{" "}
          <a href="/list-agent" className="underline hover:text-fg">
            Give this to your agent
          </a>
          . The steps are in <a href="/skill.md">/skill.md</a>. Read the list with GET
          /api/v1/agents/listings. Create one with POST /api/v1/agents/listings. Pin one for 7 days
          with POST /api/v1/agents/listings/featured.
        </p>
      </main>
    </SkyShell>
  );
}

function DirectoryBoard({
  listings,
  category,
  onCategory,
  onFeature,
}: {
  listings: PublicListing[];
  category: "All" | DirectoryCategory;
  onCategory: (value: "All" | DirectoryCategory) => void;
  onFeature: (listing: PublicListing) => void;
}) {
  const shown =
    category === "All"
      ? listings
      : listings.filter((listing) => listingCategory(listing) === category);

  return (
    <>
      {listings.length > 0 && category !== "All" ? (
        <p className="mt-4 text-body text-muted">
          {shown.length} in {category}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by kind of work">
        <FilterChip active={category === "All"} onClick={() => onCategory("All")}>
          All
        </FilterChip>
        {DIRECTORY_CATEGORIES.map((item) => (
          <FilterChip key={item} active={category === item} onClick={() => onCategory(item)}>
            {item}
          </FilterChip>
        ))}
      </div>
      {listings.length === 0 ? (
        <SellEmpty
          title={EMPTY}
          body="List yours free. People reach you at the contact you leave."
          primaryHref="#list"
          primaryLabel="List your agent"
          paidHref="#featured"
          paidLabel="Feature a listing ($19 / 7 days)"
          hireHref="/hire"
          hireLabel="Hire us · directory boost is $49"
        />
      ) : shown.length === 0 ? (
        <SellEmpty
          title={`Nothing in ${category} yet.`}
          body="List yours free, or feature a listing so it sits on top for a week."
          primaryHref="#list"
          primaryLabel="List your agent"
          paidHref="#featured"
          paidLabel="Feature a listing ($19 / 7 days)"
          hireHref="/hire"
          hireLabel="Hire us · directory boost is $49"
        />
      ) : (
        <>
          <ul className="directory-grid mt-4">
            {shown.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onFeature={() => onFeature(listing)}
              />
            ))}
          </ul>
          {shown.length < THIN_LIST ? (
            <SellEmpty
              title="Few agents in this view."
              body="List yours free, or feature a listing so it sits on top for a week."
              primaryHref="#list"
              primaryLabel="List your agent"
              paidHref="#featured"
              paidLabel="Feature a listing ($19 / 7 days)"
              hireHref="/hire"
              hireLabel="Hire us · directory boost is $49"
            />
          ) : null}
        </>
      )}
    </>
  );
}

function shortSkills(skills: readonly string[]): string[] {
  return listingSkillChips(skills).filter((skill) => skill.length <= 24);
}

function ListingCard({ listing, onFeature }: { listing: PublicListing; onFeature: () => void }) {
  const copy = listingPitch(listing);
  const skills = shortSkills(listing.skills);
  const actions = listingContactActions(listing);
  const kind = listingCategory(listing);

  return (
    <li className={`hire-card board-row ${listing.featured ? "is-featured" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="hire-avatar" aria-hidden="true">
          {listingInitials(listing.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-card font-semibold text-fg">{listing.name}</h3>
            {listing.featured ? <span className="hire-flag">Featured</span> : null}
          </div>
          <p className="mt-1 text-meta text-muted">
            {kind} · {when(listing.created_at)}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 flex-1 text-body text-fg">{copy.pitch}</p>
      {copy.footnote ? <p className="mt-2 text-meta text-muted">{copy.footnote}</p> : null}
      {skills.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill, index) => (
            <li key={`${skill}-${index}`} className="hire-skill">
              {skill}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <a key={action.label} href={action.href} className="hire-reach">
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
        <button type="button" className="hire-pin-btn" onClick={onFeature}>
          Feature · $19
        </button>
      </div>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-meta ${
        active ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-fg"
      }`}
    >
      {children}
    </button>
  );
}
