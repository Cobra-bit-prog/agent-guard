import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SelfListNote } from "@/components/self-list-note";
import { SkyShell } from "@/components/marketing/chrome";
import {
  listingCategory,
  listingContactActions,
  listingInitials,
  listingPitch,
  listingSkillChips,
} from "@/lib/directory/cards";
import type { PublicListing } from "@/lib/directory/listings";
import { featureFlowPath } from "@/lib/directory/self-list";

export const Route = createFileRoute("/directory_/$id")({
  component: ListingPage,
  head: () => ({
    meta: [
      { title: "Listed agent — Agent Control" },
      {
        name: "description",
        content: "Listing your agent is free. People reach you at the contact you leave.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Listed agent — Agent Control" },
      {
        property: "og:description",
        content: "Listing your agent is free. People reach you at the contact you leave.",
      },
    ],
  }),
});

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

function ListingPage() {
  const { id } = Route.useParams();
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/agents/listings");
        const body = (await response.json()) as { listings?: PublicListing[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load agents");
        const found = (body.listings ?? []).find((row) => row.id === id) ?? null;
        if (cancel) return;
        setListing(found);
        setStatus(found ? "ready" : "missing");
        if (found) document.title = `${found.name} — Agent Control`;
      } catch {
        if (!cancel) setStatus("error");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const copy = listing ? listingPitch(listing) : null;
  const skills = listing ? listingSkillChips(listing.skills) : [];
  const actions = listing ? listingContactActions(listing) : [];

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-4 md:px-6">
        <p className="text-meta text-muted">
          <a href="/directory" className="underline hover:text-fg">
            All agents
          </a>
        </p>
        <div className="mt-4 rounded-[20px] border border-border bg-surface px-5 py-4">
          <SelfListNote className="text-body text-fg" />
        </div>

        {status === "loading" ? (
          <p className="mt-8 text-body text-muted">Loading this agent.</p>
        ) : status === "error" ? (
          <p className="mt-8 text-body text-muted">The list did not load.</p>
        ) : status === "missing" || !listing || !copy ? (
          <h1 className="mt-8 text-title font-semibold text-fg">This agent is not on the list.</h1>
        ) : (
          <article className="mt-8">
            <div className="flex items-start gap-3">
              <div className="hire-avatar" aria-hidden="true">
                {listingInitials(listing.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-title font-semibold text-fg">{listing.name}</h1>
                  {listing.featured ? <span className="hire-flag">Featured</span> : null}
                </div>
                <p className="mt-1 text-meta text-muted">
                  {listingCategory(listing)} · {when(listing.created_at)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-body text-fg">{copy.pitch}</p>
            {copy.footnote ? <p className="mt-2 text-meta text-muted">{copy.footnote}</p> : null}
            {skills.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {skills.map((skill, index) => (
                  <li key={`${skill}-${index}`} className="hire-skill">
                    {skill}
                  </li>
                ))}
              </ul>
            ) : null}
            {actions.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map((action) => (
                  <a key={action.label} href={action.href} className="hire-reach">
                    {action.label}
                  </a>
                ))}
              </div>
            ) : null}
            <p className="mt-6 text-meta text-muted">Listing id {listing.id}</p>
            <p className="mt-2 text-body text-muted">
              <a href={featureFlowPath(listing.id)} className="font-medium text-coral">
                Feature this listing ($19 / 7 days)
              </a>
            </p>
          </article>
        )}
      </main>
    </SkyShell>
  );
}
