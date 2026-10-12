import { randomBytes } from "node:crypto";
import {
  HONEYPOT_FIELD,
  HireError,
  RATE_WINDOW_MS,
  REQUESTS_PER_HOUR,
  type HireQuery,
} from "../hire/orders.ts";
import { customerShipMail, supportShipMail, type ShipMail } from "./notify.ts";
import { isShipPackageId, shipPackage, type ShipPackageId } from "./packages.ts";

const EMAIL_MAX = 200;
const NOTE_MAX = 2000;
const ENDPOINT_MAX = 500;

export type ShipIntake = {
  package_id: ShipPackageId;
  email: string;
  endpoint: string;
  note: string;
};

export type ShipOrder = {
  id: string;
  package_id: ShipPackageId;
  package_name: string;
  amount_usd: number;
  email: string;
  endpoint: string;
  note: string;
  status: "requested";
};

type ShipRow = {
  id: string;
  package_id: string;
  package_name: string;
  amount_usd: number | string;
  email: string;
  brief: string;
  link: string | null;
  status: string;
};

export type ShipSubmitResult = {
  ok: true;
  mode: "request";
  id: string;
  package_name: string;
  amount_usd: number;
};

export type ShipMailer = (mail: ShipMail) => Promise<void>;

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

function parseEndpoint(value: unknown): string {
  if (typeof value !== "string") throw new HireError("Endpoint URL is required");
  const endpoint = value.trim();
  if (!endpoint) throw new HireError("Endpoint URL is required");
  if (endpoint.length > ENDPOINT_MAX)
    throw new HireError("Endpoint URL must be 500 characters or less");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HireError("Endpoint URL must be an https address");
  }
  if (url.protocol !== "https:") throw new HireError("Endpoint URL must be an https address");
  return url.toString();
}

function parseNote(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new HireError("That note must be 2000 characters or less");
  const note = value.trim();
  if (note.length > NOTE_MAX) throw new HireError("That note must be 2000 characters or less");
  return note;
}

export function parseShipIntake(input: unknown): ShipIntake {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HireError("Request body must be an object");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new HireError("Could not send this request.");

  const packageId = typeof body.package === "string" ? body.package.trim() : "";
  if (!isShipPackageId(packageId)) throw new HireError("Pick a package");

  return {
    package_id: packageId,
    email: parseEmail(body.email),
    endpoint: parseEndpoint(body.endpoint),
    note: parseNote(body.note),
  };
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

function mapShip(row: ShipRow): ShipOrder {
  if (!isShipPackageId(row.package_id)) throw new HireError("Unknown package", 500);
  if (!row.link) throw new HireError("Endpoint URL is required", 500);
  if (row.status !== "requested") throw new HireError("Order status is not valid", 500);
  const amount = Number(row.amount_usd);
  if (!Number.isInteger(amount)) throw new HireError("Price must stay a whole dollar amount", 500);
  return {
    id: row.id,
    package_id: row.package_id,
    package_name: row.package_name,
    amount_usd: amount,
    email: row.email,
    endpoint: row.link,
    note: row.brief,
    status: "requested",
  };
}

/**
 * Saves a ship request on hire_orders.
 * package_id is fix or launch. link is the endpoint URL. brief is the optional note.
 * name stores the email because this form does not collect a separate name.
 * status stays requested. This path does not open card checkout.
 */
export async function insertShipOrder(
  sql: HireQuery,
  intake: ShipIntake,
  now: Date,
  ipHash: string,
): Promise<ShipOrder> {
  const pack = shipPackage(intake.package_id);
  if (!pack) throw new HireError("Pick a package");
  const recent = await recentCount(sql, ipHash, now);
  if (recent >= REQUESTS_PER_HOUR) {
    throw new HireError("Too many requests from this network. Try again later.", 429);
  }
  const id = `ship_${randomBytes(12).toString("hex")}`;
  const rows = await sql.query<ShipRow>(
    `insert into hire_orders (
       id, package_id, package_name, amount_usd, name, email, brief, link, status, ip_hash, created_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'requested', $9, $10)
     returning id, package_id, package_name, amount_usd, email, brief, link, status`,
    [
      id,
      pack.id,
      pack.name,
      pack.priceUsd,
      intake.email,
      intake.email,
      intake.note,
      intake.endpoint,
      ipHash,
      now,
    ],
  );
  const row = rows[0];
  if (!row) throw new HireError("Could not save this request.", 500);
  return mapShip(row);
}

export async function submitShipOrder(opts: {
  sql: HireQuery;
  body: unknown;
  now: Date;
  ipHash: string;
  sendMail: ShipMailer;
}): Promise<ShipSubmitResult> {
  const intake = parseShipIntake(opts.body);
  const order = await insertShipOrder(opts.sql, intake, opts.now, opts.ipHash);
  const view = {
    id: order.id,
    package_name: order.package_name,
    amount_usd: order.amount_usd,
    email: order.email,
    endpoint: order.endpoint,
    note: order.note,
  };
  await opts.sendMail(supportShipMail(view));
  await opts.sendMail(customerShipMail(view));
  return {
    ok: true,
    mode: "request",
    id: order.id,
    package_name: order.package_name,
    amount_usd: order.amount_usd,
  };
}
