/**
 * Ship to paid mail. Support gets the endpoint and the note.
 * The customer gets a reply promise. Nothing has been charged.
 */
import {
  SHIP_CHARGE_LINE,
  SHIP_HONESTY_LINE,
  SHIP_PAY_LINE,
  SHIP_SCOPE_LINE,
  SHIP_REPLY_LINE,
  SHIP_SUPPORT_EMAIL,
  formatShipPrice,
} from "./packages.ts";

export type ShipMailOrder = {
  id: string;
  package_name: string;
  amount_usd: number;
  email: string;
  endpoint: string;
  note: string;
};

export type ShipMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function supportShipMail(order: ShipMailOrder): ShipMail {
  const price = formatShipPrice(order.amount_usd);
  const state = "Request saved. This is not paid yet. Reply with a USDC payment link.";
  const note = order.note.trim() ? order.note : "(none)";
  const subject = `Ship to paid — ${order.package_name} — ${price}`;
  const lines = [
    state,
    "",
    `Package: ${order.package_name}`,
    `Price: ${price}`,
    `Email: ${order.email}`,
    `Endpoint: ${order.endpoint}`,
    `Order: ${order.id}`,
    "",
    "Note:",
    note,
  ];
  const text = lines.join("\n");
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">${escapeHtml(subject)}</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(state)}</p>
  <p style="font-size:15px;line-height:1.55;color:#444"><strong>${escapeHtml(order.package_name)}</strong> · ${escapeHtml(price)}</p>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(order.email)}</p>
  <p style="font-size:15px;line-height:1.55"><a href="${escapeHtml(order.endpoint)}">${escapeHtml(order.endpoint)}</a></p>
  <p style="font-size:15px;line-height:1.55;color:#111;white-space:pre-wrap">${escapeHtml(note)}</p>
  <p style="font-size:12px;line-height:1.5;color:#888">Order ${escapeHtml(order.id)}</p>
</div>`;
  return { to: SHIP_SUPPORT_EMAIL, subject, text, html };
}

export function customerShipMail(order: ShipMailOrder): ShipMail {
  const price = formatShipPrice(order.amount_usd);
  const subject = `We got your request — ${order.package_name}`;
  const lead = `We saved your request for ${order.package_name} (${price}). ${SHIP_CHARGE_LINE}`;
  const text = [
    lead,
    "",
    SHIP_REPLY_LINE,
    SHIP_PAY_LINE,
    SHIP_SCOPE_LINE,
    SHIP_HONESTY_LINE,
    "",
    `Questions? Email ${SHIP_SUPPORT_EMAIL}.`,
  ].join("\n");
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">${escapeHtml(subject)}</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(lead)}</p>
  <p style="font-size:15px;line-height:1.55;color:#111">${escapeHtml(SHIP_REPLY_LINE)}</p>
  <p style="font-size:15px;line-height:1.55;color:#111">${escapeHtml(SHIP_PAY_LINE)}</p>
  <p style="font-size:15px;line-height:1.55;color:#111">${escapeHtml(SHIP_SCOPE_LINE)}</p>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(SHIP_HONESTY_LINE)}</p>
  <p style="font-size:12px;line-height:1.5;color:#888">Questions? Email <a href="mailto:${SHIP_SUPPORT_EMAIL}" style="color:#111">${SHIP_SUPPORT_EMAIL}</a>.</p>
</div>`;
  return { to: order.email, subject, text, html };
}
