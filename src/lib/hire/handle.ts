import { getSql } from "../db.ts";
import { notifyPaidSubscriber } from "../paid-subscriber-notify.ts";
import { json, originFromRequest } from "../server/http.ts";
import {
  createHireCheckoutSession,
  hireCardConfigured,
  retrieveHireCheckoutSession,
} from "./checkout.ts";
import { deliverHireMail, type HireMail } from "./notify.ts";
import {
  HireError,
  clientIp,
  confirmHirePayment,
  hashHireIp,
  isUndefinedHireTable,
  submitHireOrder,
} from "./orders.ts";
import { HIRE_PACKAGES, formatHirePrice } from "./packages.ts";

async function sendMail(mail: HireMail): Promise<void> {
  await deliverHireMail(mail);
}

export function hireCatalogResponse(): Response {
  return json({
    card: hireCardConfigured(),
    packages: HIRE_PACKAGES.map((pack) => ({
      id: pack.id,
      name: pack.name,
      price_usd: pack.priceUsd,
      price: formatHirePrice(pack.priceUsd),
      included: pack.included,
      excluded: pack.excluded,
    })),
  });
}

export async function postHireOrder(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  try {
    const sql = await getSql();
    const result = await submitHireOrder({
      sql,
      body,
      now: new Date(),
      ipHash: hashHireIp(clientIp(request.headers)),
      card: hireCardConfigured(),
      startCheckout: (order) =>
        createHireCheckoutSession({
          orderId: order.id,
          packageId: order.package_id,
          packageName: order.package_name,
          amountUsd: order.amount_usd,
          email: order.email,
          origin: originFromRequest(request),
        }),
      sendMail,
    });
    return json(result, 201);
  } catch (err) {
    if (isUndefinedHireTable(err)) {
      return json({ error: "Hire us is not on this database yet." }, 503);
    }
    if (err instanceof HireError) return json({ error: err.message }, err.status);
    console.error("[hire] create failed", err instanceof Error ? err.name : "error");
    return json({ error: "Could not send this request." }, 500);
  }
}

export async function confirmPaidHire(request: Request): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim() ?? "";
  if (!sessionId) return json({ error: "Missing payment." }, 400);
  try {
    const session = await retrieveHireCheckoutSession(sessionId);
    const sql = await getSql();
    const confirmed = await confirmHirePayment({
      sql,
      session,
      now: new Date(),
      sendMail,
      onPaid: async (order) => {
        await notifyPaidSubscriber({
          planName: order.package_name,
          at: new Date().toISOString(),
          userEmail: order.email,
          payRequestId: order.id,
          chain: "Card",
          amount: formatHirePrice(order.amount_usd),
        });
      },
    });
    return json(confirmed);
  } catch (err) {
    if (isUndefinedHireTable(err)) {
      return json({ error: "Hire us is not on this database yet." }, 503);
    }
    if (err instanceof HireError) return json({ error: err.message }, err.status);
    console.error("[hire] confirm failed", err instanceof Error ? err.name : "error");
    return json({ error: "Could not confirm this payment." }, 500);
  }
}
