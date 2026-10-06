import { createHash, randomBytes } from "node:crypto";

export class ListingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ListingError";
    this.status = status;
  }
}

export const HONEYPOT_FIELD = "company_website";
/**
 * Public directory posts allowed from one IP hash per hour.
 * 20 leaves room for a person to list several agents. The honeypot and the
 * one-hour window still bound a single network.
 */
export const POSTS_PER_HOUR = 20;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
/**
 * Visible rows returned by the public directory.
 * Seed waves 0031 (55) and 0034 (254) are 309 names, plus live posts.
 * 1000 covers that board. Featured rows still sort first inside the window.
 */
export const DIRECTORY_LIST_LIMIT = 1000;

const NAME_MAX = 80;
const SKILL_MAX = 32;
const SKILLS_MAX = 8;
const PITCH_MAX = 280;
const CONTACT_MAX = 200;
const LINK_MAX = 500;

export type PublicListing = {
  id: string;
  name: string;
  skills: string[];
  pitch: string;
  contact: string;
  link: string | null;
  created_at: string;
  featured: boolean;
  featured_until: string | null;
};

export interface ListingQuery {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type ListingRow = {
  id: string;
  name: string;
  skills: unknown;
  pitch: string;
  contact: string;
  link: string | null;
  created_at: Date | string;
  featured_until?: Date | string | null;
};

const PUBLIC_COLUMNS = `id, name, skills, pitch, contact, link, created_at`;

export function isUndefinedTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "42P01") return true;
  const message = err instanceof Error ? err.message : "";
  return /agent_listings/i.test(message) && /does not exist/i.test(message);
}

/** Preview builds skip migration 0033, so featured_until may be absent. */
export function isMissingFeaturedColumn(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "42703" && /featured_until/i.test(message)) return true;
  return /featured_until/i.test(message) && /does not exist/i.test(message);
}

export function hashClientIp(ip: string): string {
  return createHash("sha256").update(`agent-listing:${ip}`).digest("hex");
}

export function clientIp(headers: { get(name: string): string | null }): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return "unknown";
}

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ListingError("Invalid timestamp");
  return parsed.toISOString();
}

function asSkills(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1);
      if (!inner) return [];
      return inner.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
    }
  }
  throw new ListingError("Could not read skills");
}

function mapListing(row: ListingRow, now: Date): PublicListing {
  const featuredUntil = row.featured_until ? iso(row.featured_until) : null;
  const featuredAt = featuredUntil ? new Date(featuredUntil).getTime() : Number.NaN;
  return {
    id: row.id,
    name: row.name,
    skills: asSkills(row.skills),
    pitch: row.pitch,
    contact: row.contact,
    link: row.link,
    created_at: iso(row.created_at),
    featured_until: featuredUntil,
    featured: Number.isFinite(featuredAt) && featuredAt > now.getTime(),
  };
}

function honeypotFilled(body: Record<string, unknown>): boolean {
  if (!(HONEYPOT_FIELD in body)) return false;
  const value = body[HONEYPOT_FIELD];
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim().length > 0;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function parseSkills(value: unknown): string[] {
  let parts: string[];
  if (typeof value === "string") {
    parts = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  } else if (Array.isArray(value) && value.every((part) => typeof part === "string")) {
    parts = value.map((part) => part.trim()).filter((part) => part.length > 0);
  } else {
    throw new ListingError("List skills separated by commas");
  }
  if (parts.length < 1 || parts.length > SKILLS_MAX) throw new ListingError("List 1 to 8 skills");
  if (parts.some((part) => part.length > SKILL_MAX)) {
    throw new ListingError("Each skill must be 32 characters or less");
  }
  return parts;
}

export function parseListing(input: unknown): {
  name: string;
  skills: string[];
  pitch: string;
  contact: string;
  link: string | null;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ListingError("Listing body must be an object");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new ListingError("Could not list this agent.");

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const pitch = typeof body.pitch === "string" ? body.pitch.trim() : "";
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  const linkRaw = body.link == null ? "" : typeof body.link === "string" ? body.link.trim() : null;

  if (!name) throw new ListingError("Name is required");
  if (name.length > NAME_MAX) throw new ListingError("Name must be 80 characters or less");
  if (body.skills == null || body.skills === "") throw new ListingError("Skills are required");
  const skills = parseSkills(body.skills);
  if (!pitch) throw new ListingError("Pitch is required");
  if (pitch.length > PITCH_MAX) throw new ListingError("Pitch must be 280 characters or less");
  if (!contact) throw new ListingError("Contact is required");
  if (contact.length > CONTACT_MAX) throw new ListingError("Contact must be 200 characters or less");
  if (!isEmail(contact) && !isHttpsUrl(contact)) {
    throw new ListingError("Contact must be an email or an https link");
  }
  if (linkRaw == null) throw new ListingError("Link must be an https link");
  if (linkRaw.length > LINK_MAX) throw new ListingError("Link must be 500 characters or less");
  if (linkRaw && !isHttpsUrl(linkRaw)) throw new ListingError("Link must be an https link");

  return {
    name,
    skills,
    pitch,
    contact,
    link: linkRaw || null,
  };
}

export async function listVisibleListings(sql: ListingQuery, now: Date = new Date()): Promise<PublicListing[]> {
  try {
    const rows = await sql.query<ListingRow>(
      `select ${PUBLIC_COLUMNS}, featured_until
       from agent_listings
       where hidden_at is null
       order by case when featured_until > $1 then 0 else 1 end,
                case when featured_until > $1 then featured_until end desc nulls last,
                created_at desc
       limit $2`,
      [now, DIRECTORY_LIST_LIMIT],
    );
    return rows.map((row) => mapListing(row, now));
  } catch (err) {
    if (!isMissingFeaturedColumn(err)) throw err;
    const rows = await sql.query<ListingRow>(
      `select ${PUBLIC_COLUMNS}
       from agent_listings
       where hidden_at is null
       order by created_at desc
       limit $1`,
      [DIRECTORY_LIST_LIMIT],
    );
    return rows.map((row) => mapListing(row, now));
  }
}

export async function createListing(
  sql: ListingQuery,
  input: unknown,
  now: Date,
  ipHash: string,
): Promise<PublicListing> {
  const listing = parseListing(input);
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n
     from agent_listings
     where ip_hash = $1 and created_at > $2`,
    [ipHash, windowStart],
  );
  const recent = Number(counts[0]?.n ?? 0);
  if (recent >= POSTS_PER_HOUR) {
    throw new ListingError("Too many posts from this network. Try again later.", 429);
  }

  const id = `agent_${randomBytes(12).toString("hex")}`;
  const rows = await sql.query<ListingRow>(
    `insert into agent_listings (
       id, name, skills, pitch, contact, link, ip_hash, created_at
     ) values ($1, $2, $3::text[], $4, $5, $6, $7, $8)
     returning ${PUBLIC_COLUMNS}`,
    [id, listing.name, listing.skills, listing.pitch, listing.contact, listing.link, ipHash, now],
  );
  const row = rows[0];
  if (!row) throw new ListingError("Could not list this agent.", 500);
  return mapListing(row, now);
}
