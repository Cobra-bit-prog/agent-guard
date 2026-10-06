import { createHash, randomBytes } from "node:crypto";
import {
  hirePackage,
  isHirePackageId,
  type HirePackageId,
} from "./packages.ts";
import type { HireMail, HireMailKind } from "./notify.ts";
import { customerHireMail, supportHireMail } from "./notify.ts";
import { sessionMatchesOrder, type HireCheckoutSession } from "./checkout.ts";

export class HireError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "HireError";
    this.status = status;
  }
}

export const HONEYPOT_FIELD = "company_website";
export const REQUESTS_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

const NAME_MAX = 80;
const EMAIL_MAX = 200;
const BRIEF_MAX = 2000;
const LINK_MAX = 500;

export type HireOrderStatus = "requested" | "checkout" | "paid";

export type HireOrder = {
  id: string;
  package_id: HirePackageId;
  package_name: string;
  amount_usd: number;
  name: string;
  email: string;
  brief: string;
  link: string | null;
  status: HireOrderStatus;
  stripe_session_id: string | null;
  created_at: string;
};

export type HireIntake = {
  package_id: HirePackageId;
  name: string;
  email: string;
  brief: string;
  link: string | null;
};

export interface HireQuery {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type HireRow = {
  id: string;
  package_id: string;
  package_name: string;
  amount_usd: number | string;
  name: string;
  email: string;
  brief: string;
  link: string | null;
  status: string;
  stripe_session_id: string | null;
  created_at: Date | string;
};

const PUBLIC_COLUMNS = `id, package_id, package_name, amount_usd, name, email, brief, link, status, stripe_session_id, created_at`;

export function isUndefinedHireTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "42P01") return true;
  const message = err instanceof Error ? err.message : "";
  return /hire_orders/i.test(message) && /does not exist/i.test(message);
}

export function hashHireIp(ip: string): string {
  return createHash("sha256").update(`hire-order:${ip}`).digest("hex");
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
  if (Number.isNaN(parsed.getTime())) throw new HireError("Invalid timestamp");
  return parsed.toISOString();
}

function asStatus(value: string): HireOrderStatus {
  if (value === "requested" || value === "checkout" || value === "paid") return value;
  throw new HireError("Order status is not valid", 500);
}

function mapOrder(row: HireRow): HireOrder {
  if (!isHirePackageId(row.package_id)) throw new HireError("Unknown package", 500);
  const amount = Number(row.amount_usd);
  if (!Number.isInteger(amount)) throw new HireError("Price must stay a whole dollar amount", 500);
  return {
    id: row.id,
    package_id: row.package_id,
    package_name: row.package_name,
    amount_usd: amount,
    name: row.name,
    email: row.email,
    brief: row.brief,
    link: row.link,
    status: asStatus(row.status),
    stripe_session_id: row.stripe_session_id,
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

function parseEmail(value: unknown): string {
  if (typeof value !== "string") throw new HireError("Email is required");
  const email = value.trim();
  if (!email) throw new HireError("Email is required");
  if (email.length > EMAIL_MAX) throw new HireError("Email must be 200 characters or less");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HireError("Enter a real email address");
  return email;
}

function parseLink(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new HireError("Link must be an https address");
  const link = value.trim();
  if (!link) return null;
  if (link.length > LINK_MAX) throw new HireError("Link must be 500 characters or less");
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new HireError("Link must be an https address");
  }
  if (url.protocol !== "https:") throw new HireError("Link must be an https address");
  return url.toString();
}

export function parseHireIntake(input: unknown): HireIntake {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HireError("Request body must be an object");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new HireError("Could not send this request.");

  const packageId = typeof body.package === "string" ? body.package.trim() : "";
  if (!isHirePackageId(packageId)) throw new HireError("Pick a package");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new HireError("Name is required");
  if (name.length > NAME_MAX) throw new HireError("Name must be 80 characters or less");
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (!brief) throw new HireError("Tell us what you need");
  if (brief.length > BRIEF_MAX) throw new HireError("That note must be 2000 characters or less");

  return {
    package_id: packageId,
    name,
    email: parseEmail(body.email),
    brief,
    link: parseLink(body.link),
  };
}

export function hireMailOrder(order: HireOrder): {
  id: string;
  package_name: string;
  amount_usd: number;
  name: string;
  email: string;
  brief: string;
  link: string | null;
} {
  return {
    id: order.id,
    package_name: order.package_name,
    amount_usd: order.amount_usd,
    name: order.name,
    email: order.email,
    brief: order.brief,
    link: order.link,
  };
}

export function mailsFor(order: HireOrder, kind: HireMailKind): HireMail[] {
  const view = hireMailOrder(order);
  if (kind === "paid") return [supportHireMail(view, "paid"), customerHireMail(view, "paid")];
  if (kind === "checkout") return [supportHireMail(view, "checkout")];
  return [supportHireMail(view, "request"), customerHireMail(view, "request")];
}

async function recentCount(sql: HireQuery, ipHash: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n
     from hire_orders
     where ip_hash = $1 and created_at > $2`,
    [ipHash, windowStart],
  );
  return Number(counts[0]?.n ?? 0);
}

export async function insertHireOrder(
  sql: HireQuery,
  intake: HireIntake,
  now: Date,
  ipHash: string,
): Promise<HireOrder> {
  const pack = hirePackage(intake.package_id);
  if (!pack) throw new HireError("Pick a package");
  const recent = await recentCount(sql, ipHash, now);
  if (recent >= REQUESTS_PER_HOUR) {
    throw new HireError("Too many requests from this network. Try again later.", 429);
  }
  const id = `hire_${randomBytes(12).toString("hex")}`;
  const rows = await sql.query<HireRow>(
    `insert into hire_orders (
       id, package_id, package_name, amount_usd, name, email, brief, link, status, ip_hash, created_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'requested', $9, $10)
     returning ${PUBLIC_COLUMNS}`,
    [
      id,
      pack.id,
      pack.name,
      pack.priceUsd,
      intake.name,
      intake.email,
      intake.brief,
      intake.link,
      ipHash,
      now,
    ],
  );
  const row = rows[0];
  if (!row) throw new HireError("Could not save this request.", 500);
  return mapOrder(row);
}

export async function markHireCheckout(
  sql: HireQuery,
  orderId: string,
  sessionId: string,
): Promise<HireOrder> {
  const rows = await sql.query<HireRow>(
    `update hire_orders
     set status = 'checkout', stripe_session_id = $2
     where id = $1 and status = 'requested'
     returning ${PUBLIC_COLUMNS}`,
    [orderId, sessionId],
  );
  const row = rows[0];
  if (!row) throw new HireError("Could not open checkout.", 500);
  return mapOrder(row);
}

export async function getHireOrder(sql: HireQuery, orderId: string): Promise<HireOrder | null> {
  const rows = await sql.query<HireRow>(
    `select ${PUBLIC_COLUMNS} from hire_orders where id = $1`,
    [orderId],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

/**
 * Marks the order paid and returns notify=true only the first time.
 * A second confirmation of the same Stripe session does not send mail again.
 */
export async function markHirePaid(
  sql: HireQuery,
  orderId: string,
  sessionId: string,
  now: Date,
): Promise<{ order: HireOrder; notify: boolean }> {
  const rows = await sql.query<HireRow>(
    `update hire_orders
     set status = 'paid',
         paid_at = coalesce(paid_at, $3),
         stripe_session_id = $2,
         notified_at = $3
     where id = $1
       and notified_at is null
       and (stripe_session_id is null or stripe_session_id = $2)
     returning ${PUBLIC_COLUMNS}`,
    [orderId, sessionId, now],
  );
  const row = rows[0];
  if (row) return { order: mapOrder(row), notify: true };

  const existing = await getHireOrder(sql, orderId);
  if (
    !existing ||
    existing.status !== "paid" ||
    (existing.stripe_session_id !== null && existing.stripe_session_id !== sessionId)
  ) {
    throw new HireError("This payment does not match the order.", 409);
  }
  return { order: existing, notify: false };
}

export type HireCheckoutStarter = (order: HireOrder) => Promise<{ id: string; url: string }>;
export type HireMailer = (mail: HireMail) => Promise<void>;

export type HireSubmitResult =
  | { ok: true; mode: "checkout"; id: string; url: string }
  | { ok: true; mode: "request"; id: string; package_name: string; amount_usd: number };

export async function submitHireOrder(opts: {
  sql: HireQuery;
  body: unknown;
  now: Date;
  ipHash: string;
  card: boolean;
  startCheckout?: HireCheckoutStarter;
  sendMail: HireMailer;
}): Promise<HireSubmitResult> {
  const intake = parseHireIntake(opts.body);
  const order = await insertHireOrder(opts.sql, intake, opts.now, opts.ipHash);
  if (opts.card && opts.startCheckout) {
    try {
      const session = await opts.startCheckout(order);
      const opened = await markHireCheckout(opts.sql, order.id, session.id);
      await opts.sendMail(supportHireMail(hireMailOrder(opened), "checkout"));
      return { ok: true, mode: "checkout", id: opened.id, url: session.url };
    } catch (err) {
      if (err instanceof HireError && err.status === 429) throw err;
      console.error("[hire] checkout failed", err instanceof Error ? err.name : "error");
    }
  }
  for (const mail of mailsFor(order, "request")) {
    await opts.sendMail(mail);
  }
  return {
    ok: true,
    mode: "request",
    id: order.id,
    package_name: order.package_name,
    amount_usd: order.amount_usd,
  };
}

export async function confirmHirePayment(opts: {
  sql: HireQuery;
  session: HireCheckoutSession;
  now: Date;
  sendMail: HireMailer;
  onPaid?: (order: HireOrder) => Promise<void>;
}): Promise<{ package_name: string; amount_usd: number; status: "paid" }> {
  const orderId = opts.session.metadata?.order_id || opts.session.client_reference_id || "";
  if (!orderId) throw new HireError("This payment is missing an order.", 400);
  const existing = await getHireOrder(opts.sql, orderId);
  if (!existing) throw new HireError("We could not find that order.", 404);
  if (!sessionMatchesOrder(opts.session, existing)) {
    throw new HireError("This payment is not complete.", 400);
  }
  if (!opts.session.id) throw new HireError("This payment is missing an order.", 400);
  const { order, notify } = await markHirePaid(opts.sql, existing.id, opts.session.id, opts.now);
  if (notify) {
    for (const mail of mailsFor(order, "paid")) {
      await opts.sendMail(mail);
    }
    if (opts.onPaid) await opts.onPaid(order);
  }
  return {
    package_name: order.package_name,
    amount_usd: order.amount_usd,
    status: "paid",
  };
}
