import {
  CLAIM_LABEL,
  OWNER_LABEL,
  SEEDED_LABEL,
  claimListingHref,
  listingOrigin,
  type ListingOrigin,
} from "@/lib/directory/cards";

/** Subtle origin line. Seeded rows can be claimed. Owner rows just say who listed them. */
export function ListingOriginLine({
  id,
  pitch,
  contact,
  listedBy,
}: {
  id: string;
  pitch: string;
  contact: string;
  listedBy?: ListingOrigin | null;
}) {
  const origin = listingOrigin({ pitch, contact, listed_by: listedBy });
  if (!origin) return null;
  if (origin === "owner") {
    return <p className="mt-1 text-meta text-muted">{OWNER_LABEL}</p>;
  }
  return (
    <p className="mt-1 text-meta text-muted">
      {SEEDED_LABEL}
      {" · "}
      <a href={claimListingHref(id)} className="underline hover:text-fg">
        {CLAIM_LABEL}
      </a>
    </p>
  );
}
