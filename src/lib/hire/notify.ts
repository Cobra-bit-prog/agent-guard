/**
 * Hire us mail. Support always gets the brief. The customer gets a reply
 * promise on a saved request, and a thank-you after a verified card payment.
 */
import { HIRE_SUPPORT_EMAIL, formatHirePrice } from "./packages.ts";

export type HireMailKind = "request" | "checkout" | "paid";

export type HireMailOrder = {
  id: string;
  package_name: string;
  amount_usd: number;
  name: string;
  email: string;
  brief: string;
  link: string | null;
};

export type HireMail = {
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

function envValue(key: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function supportHireMail(order: HireMailOrder, kind: HireMailKind): HireMail {
  const price = formatHirePrice(order.amount_usd);
  const state =
    kind === "paid"
      ? "Paid. Our team can start."
      : kind === "checkout"
        ? "Checkout is open. Payment is not in yet. Do not start until it shows paid."
        : "Request saved. Card checkout is off, so this is not paid yet.";
  const subject = `Hire us — ${order.package_name} — ${price}${kind === "paid" ? " — paid" : ""}`;
  const lines = [
    state,
    "",
    `Package: ${order.package_name}`,
    `Price: ${price}`,
    `Name: ${order.name}`,
    `Email: ${order.email}`,
    `Order: ${order.id}`,
  ];
  if (order.link) lines.push(`Link: ${order.link}`);
  lines.push("", "Brief:", order.brief);
  const text = lines.join("\n");
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">${escapeHtml(subject)}</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(state)}</p>
  <p style="font-size:15px;line-height:1.55;color:#444"><strong>${escapeHtml(order.package_name)}</strong> · ${escapeHtml(price)}</p>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(order.name)} · ${escapeHtml(order.email)}</p>
  ${order.link ? `<p style="font-size:15px;line-height:1.55"><a href="${escapeHtml(order.link)}">${escapeHtml(order.link)}</a></p>` : ""}
  <p style="font-size:15px;line-height:1.55;color:#111;white-space:pre-wrap">${escapeHtml(order.brief)}</p>
  <p style="font-size:12px;line-height:1.5;color:#888">Order ${escapeHtml(order.id)}</p>
</div>`;
  return { to: HIRE_SUPPORT_EMAIL, subject, text, html };
}

export function customerHireMail(order: HireMailOrder, kind: "request" | "paid"): HireMail {
  const price = formatHirePrice(order.amount_usd);
  const paid = kind === "paid";
  const subject = paid
    ? `Thanks — ${order.package_name}`
    : `We got your request — ${order.package_name}`;
  const lead = paid
    ? `We received your payment of ${price} for ${order.package_name}. Our team will do this work.`
    : `We saved your request for ${order.package_name} (${price}). Card checkout is off, so nothing has been charged.`;
  const text = [
    lead,
    "",
    "We'll reply within 1 business day.",
    "",
    `Questions? Email ${HIRE_SUPPORT_EMAIL}.`,
  ].join("\n");
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">${escapeHtml(subject)}</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">${escapeHtml(lead)}</p>
  <p style="font-size:15px;line-height:1.55;color:#111">We'll reply within 1 business day.</p>
  <p style="font-size:12px;line-height:1.5;color:#888">Questions? Email <a href="mailto:${HIRE_SUPPORT_EMAIL}" style="color:#111">${HIRE_SUPPORT_EMAIL}</a>.</p>
</div>`;
  return { to: order.email, subject, text, html };
}

/** Returns false when mail is skipped or Resend fails. Never throws. */
export async function deliverHireMail(
  mail: HireMail,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const apiKey = envValue("RESEND_API_KEY", env);
    if (!apiKey) {
      console.error("[hire] RESEND_API_KEY is not set; hire email skipped");
      return false;
    }
    const from = envValue("EMAIL_FROM", env) ?? "Agent Control <noreply@agent-control.net>";
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!response.ok) {
      console.error("[hire] Resend failed", response.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[hire] email failed", err instanceof Error ? err.name : "error");
    return false;
  }
}
