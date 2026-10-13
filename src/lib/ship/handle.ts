import { deliverHireMail } from "../hire/notify.ts";
import {
  HireError,
  clientIp,
  hashHireIp,
  isUndefinedHireTable,
  type HireQuery,
} from "../hire/orders.ts";
import { json } from "../server/http.ts";
import type { ShipMail } from "./notify.ts";
import { submitShipOrder } from "./orders.ts";
import {
  SHIP_HONESTY_LINE,
  SHIP_PACKAGES,
  SHIP_PAY_LINE,
  SHIP_SCOPE_LINE,
  SHIP_REPLY_LINE,
  formatShipPrice,
} from "./packages.ts";

async function sendMail(mail: ShipMail): Promise<void> {
  await deliverHireMail(mail);
}

export function shipCatalogResponse(): Response {
  return json({
    request_only: true,
    charged_from_form: false,
    pay: SHIP_PAY_LINE,
    reply: SHIP_REPLY_LINE,
    scope: SHIP_SCOPE_LINE,
    honesty: SHIP_HONESTY_LINE,
    packages: SHIP_PACKAGES.map((pack) => ({
      id: pack.id,
      name: pack.name,
      price_usd: pack.priceUsd,
      price: formatShipPrice(pack.priceUsd),
      days: pack.days,
      included: pack.included,
      excluded: pack.excluded,
    })),
  });
}

export async function handleShipRequest(
  request: Request,
  sql: HireQuery | null,
  now = new Date(),
): Promise<Response> {
  if (request.method === "GET") return shipCatalogResponse();
  if (request.method !== "POST") return json({ error: "Use POST to send a request." }, 405);
  if (!sql) return json({ error: "Ship to paid is not on this database yet." }, 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  try {
    const result = await submitShipOrder({
      sql,
      body,
      now,
      ipHash: hashHireIp(clientIp(request.headers)),
      sendMail,
    });
    return json(result, 201);
  } catch (err) {
    if (isUndefinedHireTable(err)) {
      return json({ error: "Ship to paid is not on this database yet." }, 503);
    }
    if (err instanceof HireError) return json({ error: err.message }, err.status);
    console.error("[ship] create failed", err instanceof Error ? err.name : "error");
    return json({ error: "Could not send this request." }, 500);
  }
}

export async function postShipOrder(request: Request): Promise<Response> {
  try {
    const { getSql } = await import("../db.ts");
    const sql = await getSql();
    return await handleShipRequest(request, sql);
  } catch (err) {
    if (isUndefinedHireTable(err)) {
      return json({ error: "Ship to paid is not on this database yet." }, 503);
    }
    console.error("[ship] create failed", err instanceof Error ? err.name : "error");
    return json({ error: "Could not send this request." }, 500);
  }
}
