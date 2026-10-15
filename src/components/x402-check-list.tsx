import { useState, type FormEvent } from "react";
import { FEATURED_UPSELL } from "@/lib/directory/featured-copy";
import { LISTINGS_PATH, featureFlowPath, listingPagePath } from "@/lib/directory/self-list";
import { trackListAgentSubmit } from "@/lib/site-events";
import {
  ALREADY_LISTED_LINE,
  composeListingPitch,
  type X402ListingPrefill,
} from "@/lib/x402-check/listing-draft";

type CreatedListing = {
  id: string;
  name: string;
};

const fieldClass = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg";

export function X402CheckList({ listing }: { listing: X402ListingPrefill }) {
  const [name, setName] = useState(listing.name);
  const [description, setDescription] = useState(listing.description);
  const [skills, setSkills] = useState(listing.skills.join(", "));
  const [price, setPrice] = useState(listing.price ?? "");
  const [network, setNetwork] = useState(listing.network ?? "");
  const [payTo, setPayTo] = useState(listing.pay_to ?? "");
  const [endpoint, setEndpoint] = useState(listing.endpoint_url ?? "");
  const [contact, setContact] = useState(listing.contact);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedListing | null>(null);
  const [blocked, setBlocked] = useState<CreatedListing | null>(null);

  const already =
    listing.existing ??
    (blocked
      ? {
          id: blocked.id,
          name: blocked.name,
          line: ALREADY_LISTED_LINE,
        }
      : null);

  if (already) {
    return (
      <section
        className="mt-10 rounded-[20px] border border-border bg-surface p-5"
        aria-labelledby="x402-already-listed"
      >
        <h2 id="x402-already-listed" className="text-title font-semibold">
          List this endpoint free
        </h2>
        <p className="mt-2 text-body text-muted">{already.line}</p>
        <p className="mt-3 text-body">
          <a href={listingPagePath(already.id)} className="font-medium text-navy hover:text-coral">
            {already.name}
          </a>
        </p>
        <p className="mt-3 text-body">
          <a href={featureFlowPath(already.id)} className="font-medium text-coral">
            {FEATURED_UPSELL}
          </a>
        </p>
      </section>
    );
  }

  if (created) {
    return (
      <section
        className="mt-10 rounded-[20px] border border-border bg-surface p-5"
        aria-labelledby="x402-listed"
      >
        <h2 id="x402-listed" className="text-title font-semibold">
          Listed
        </h2>
        <p className="mt-2 text-body">
          <a href={listingPagePath(created.id)} className="font-medium text-navy hover:text-coral">
            See the listing
          </a>
        </p>
        <p className="mt-3 text-body">
          <a href={featureFlowPath(created.id)} className="font-medium text-coral">
            {FEATURED_UPSELL}
          </a>
        </p>
      </section>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const pitch = composeListingPitch({
      description,
      price: price.trim() || null,
      network: network.trim() || null,
      pay_to: payTo.trim() || null,
    });
    const link = endpoint.trim();
    try {
      if (link) {
        const listed = await fetch(LISTINGS_PATH);
        if (listed.ok) {
          const current = (await listed.json()) as {
            listings?: Array<{ id: string; name: string; link: string | null }>;
          };
          const match = (current.listings ?? []).find((row) => row.link === link);
          if (match) {
            setBlocked({ id: match.id, name: match.name });
            return;
          }
        }
      }
      const response = await fetch(LISTINGS_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          skills,
          pitch,
          contact,
          link: endpoint,
          company_website: companyWebsite,
        }),
      });
      const body = (await response.json()) as { listing?: CreatedListing; error?: string };
      if (!response.ok || !body.listing) {
        throw new Error(body.error || "Could not list this endpoint.");
      }
      setCreated(body.listing);
      trackListAgentSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list this endpoint.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="mt-10 rounded-[20px] border border-border bg-surface p-5"
      aria-labelledby="x402-list"
    >
      <h2 id="x402-list" className="text-title font-semibold">
        List this endpoint free
      </h2>
      <p className="mt-2 text-body text-muted">
        These fields come from the 402. Review them, then list the endpoint. Listing is free.
      </p>
      <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Name
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            name="name"
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Description
          <textarea
            className={`${fieldClass} min-h-24`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={280}
            required
            name="description"
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Skills
          <input
            className={fieldClass}
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            required
            name="skills"
          />
          <span className="text-meta text-muted">
            Comma separated. 1 to 8. From the tags on the 402.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Price
          <input
            className={fieldClass}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            maxLength={40}
            name="price"
            inputMode="decimal"
          />
          <span className="text-meta text-muted">
            USDC amount from the 402. Leave blank if it was missing.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Network
          <input
            className={fieldClass}
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
            maxLength={80}
            name="network"
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          payTo
          <input
            className={`${fieldClass} font-mono`}
            value={payTo}
            onChange={(event) => setPayTo(event.target.value)}
            maxLength={200}
            name="pay_to"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Endpoint URL
          <input
            className={fieldClass}
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            maxLength={500}
            name="link"
            inputMode="url"
          />
          <span className="text-meta text-muted">Optional. https only.</span>
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Contact
          <input
            className={fieldClass}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={200}
            required
            name="contact"
            autoComplete="email"
          />
          <span className="text-meta text-muted">Shown on the listing. Email or https link.</span>
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
        {error ? <p className="text-body text-coral">{error}</p> : null}
        <button
          type="submit"
          className="mt-2 w-fit rounded-full bg-navy px-5 py-2 text-body font-medium text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "Listing…" : "List this endpoint free"}
        </button>
      </form>
    </section>
  );
}
