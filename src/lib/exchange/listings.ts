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
export const POSTS_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

const TITLE_MAX = 140;
const SUMMARY_MAX = 2000;
const CONTACT_MAX = 200;
const BUDGET_MAX = 1_000_000;
const DEADLINE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export type PosterKind = "human" | "agent";

export type PublicJob = {
  id: string;
  title: string;
  summary: string;
  budget_usd: number;
  deadline: string;
  poster_kind: PosterKind;
  contact: string;
  created_at: string;
};

export interface ListingQuery {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type JobRow = {
  id: string;
  title: string;
  summary: string;
  poster_kind: string;
  amount_usdc: number | string;
  deadline_at: Date | string;
  contact: string;
  created_at: Date | string;
};

const PUBLIC_COLUMNS = `id, title, summary, poster_kind, amount_usdc, deadline_at, contact, created_at`;

export function isUndefinedTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "42P01") return true;
  const message = err instanceof Error ? err.message : "";
  return /exchange_jobs/i.test(message) && /does not exist/i.test(message);
}

export function hashPosterIp(ip: string): string {
  return createHash("sha256").update(`exchange-listing:${ip}`).digest("hex");
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

function asPoster(value: string): PosterKind {
  if (value === "human" || value === "agent") return value;
  throw new ListingError("poster_kind must be human or agent");
}

function mapJob(row: JobRow): PublicJob {
  const budget = Number(row.amount_usdc);
  if (!Number.isInteger(budget)) throw new ListingError("Budget must stay a whole dollar amount");
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    budget_usd: budget,
    deadline: iso(row.deadline_at),
    poster_kind: asPoster(row.poster_kind),
    contact: row.contact,
    created_at: iso(row.created_at),
  };
}

function honeypotFilled(body: Record<string, unknown>): boolean {
  if (!(HONEYPOT_FIELD in body)) return false;
  const value = body[HONEYPOT_FIELD];
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim().length > 0;
}

/** Absent means public. Only a boolean is accepted, so a stray value is not dropped. */
function parseHidden(body: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(body, "hidden")) return false;
  if (typeof body.hidden !== "boolean") {
    throw new ListingError("hidden must be true or false");
  }
  return body.hidden;
}

function wholeDollars(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return Number(value.trim());
  throw new ListingError("Budget must be a whole dollar amount");
}

function parseDeadline(value: unknown, now: Date): Date {
  if (typeof value !== "string" || !value.trim()) throw new ListingError("Deadline is required");
  const raw = value.trim();
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T23:59:59.999Z`)
    : new Date(raw);
  if (Number.isNaN(deadline.getTime())) throw new ListingError("Deadline is not a valid date");
  if (deadline.getTime() <= now.getTime()) throw new ListingError("Deadline must be in the future");
  if (deadline.getTime() - now.getTime() > DEADLINE_WINDOW_MS) {
    throw new ListingError("Deadline must be within 90 days");
  }
  return deadline;
}

export function parseListing(
  input: unknown,
  now: Date,
): {
  title: string;
  summary: string;
  poster_kind: PosterKind;
  budget_usd: number;
  deadline_at: Date;
  contact: string;
  hidden: boolean;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ListingError("Listing body must be an object");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new ListingError("Could not post this job.");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  if (!title) throw new ListingError("Title is required");
  if (title.length > TITLE_MAX) throw new ListingError("Title must be 140 characters or less");
  if (!summary) throw new ListingError("Say what you need done");
  if (summary.length > SUMMARY_MAX) {
    throw new ListingError("That note must be 2000 characters or less");
  }
  if (body.poster_kind !== "human" && body.poster_kind !== "agent") {
    throw new ListingError("poster_kind must be human or agent");
  }
  const budget = wholeDollars(body.budget_usd);
  if (budget < 1 || budget > BUDGET_MAX) {
    throw new ListingError("Budget must be from 1 to 1000000 dollars");
  }
  if (!contact) throw new ListingError("Contact is required");
  if (contact.length > CONTACT_MAX) throw new ListingError("Contact must be 200 characters or less");

  return {
    title,
    summary,
    poster_kind: body.poster_kind,
    budget_usd: budget,
    deadline_at: parseDeadline(body.deadline, now),
    contact,
    hidden: parseHidden(body),
  };
}

export async function listOpenJobs(sql: ListingQuery): Promise<PublicJob[]> {
  const rows = await sql.query<JobRow>(
    `select ${PUBLIC_COLUMNS}
     from exchange_jobs
     where status = 'open' and hidden_at is null
     order by created_at desc
     limit 100`,
  );
  return rows.map(mapJob);
}

export type CreatedJob = PublicJob & { hidden?: true };

export async function createListing(
  sql: ListingQuery,
  input: unknown,
  now: Date,
  ipHash: string,
): Promise<CreatedJob> {
  const listing = parseListing(input, now);
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n
     from exchange_jobs
     where poster_ip_hash = $1 and created_at > $2`,
    [ipHash, windowStart],
  );
  const recent = Number(counts[0]?.n ?? 0);
  if (recent >= POSTS_PER_HOUR) {
    throw new ListingError("Too many posts from this network. Try again later.", 429);
  }

  const id = `job_${randomBytes(12).toString("hex")}`;
  const rows = await sql.query<JobRow>(
    `insert into exchange_jobs (
       id, title, summary, poster_kind, amount_usdc, status, deadline_at, contact, poster_ip_hash, created_at, hidden_at
     ) values ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10)
     returning ${PUBLIC_COLUMNS}`,
    [
      id,
      listing.title,
      listing.summary,
      listing.poster_kind,
      listing.budget_usd,
      listing.deadline_at,
      listing.contact,
      ipHash,
      now,
      listing.hidden ? now : null,
    ],
  );
  const row = rows[0];
  if (!row) throw new ListingError("Could not post this job.", 500);
  const job = mapJob(row);
  // The poster gets the job back. Public lists omit it when hidden_at is set.
  if (listing.hidden) return { ...job, hidden: true };
  return job;
}
