/**
 * Transactional mail via Resend. Used by Better Auth for signup confirmation
 * and by billing for paid-plan thank-you invoices.
 * Set RESEND_API_KEY (and optional EMAIL_FROM) on the Vercel project.
 * EMAIL_FROM on Vercel is Agent Control <noreply@agent-control.net>.
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export function confirmationEmailEnabled(): boolean {
  return Boolean(env("RESEND_API_KEY"));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const LOGO_SRC = "https://agent-control.net/logos/04-navbar-lockup.jpg";

async function postResend(opts: {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; status: number; body: string }> {
  const from = env("EMAIL_FROM") ?? "Agent Control <noreply@agent-control.net>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

export async function sendConfirmationEmail(opts: {
  to: string;
  url: string;
}): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[auth] RESEND_API_KEY is not set; confirmation email skipped");
    return;
  }
  const url = opts.url?.trim() ?? "";
  if (!url) {
    console.error(
      "[auth] confirmation email skipped: Better Auth url is empty",
      { to: opts.to },
    );
    return;
  }
  const safeUrl = escapeHtml(url);
  const result = await postResend({
    apiKey,
    to: opts.to,
    subject: "Confirm your Agent Control account",
    html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">Confirm your email</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">Thanks for creating an account. Click the link below to confirm this address and open the console. The link expires in one hour.</p>
  <p style="margin:24px 0"><a href="${safeUrl}">Confirm email</a></p>
  <p style="font-size:14px;line-height:1.5;color:#444">Or copy this link:</p>
  <p style="font-size:13px;line-height:1.5;word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p>
  <p style="font-size:12px;line-height:1.5;color:#888">If you did not create an Agent Control account on agent-control.net, ignore this email.</p>
</div>`,
    text: `Agent-Control.net

Confirm your email

Thanks for creating an account. Click the link below to confirm this address and open the console. The link expires in one hour.

Confirm email:
${url}

Or copy this link:
${url}

If you did not create an Agent Control account on agent-control.net, ignore this email.`,
  });
  if (!result.ok) {
    console.error("[auth] Resend failed", result.status, result.body);
    throw new Error("Could not send confirmation email");
  }
}

export type InvoiceEmailResult = "sent" | "skipped";

/** Paid-plan thank-you invoice. Missing Resend key skips without throwing. */
export async function sendPaidInvoiceEmail(opts: {
  to: string;
  invoiceId: string;
  date: string;
  planName: string;
  amountUsdc: string;
  chain: string;
}): Promise<InvoiceEmailResult> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[billing] RESEND_API_KEY is not set; invoice email skipped");
    return "skipped";
  }
  const to = opts.to.trim();
  if (!to) return "skipped";
  const invoiceId = escapeHtml(opts.invoiceId);
  const date = escapeHtml(opts.date);
  const planName = escapeHtml(opts.planName);
  const amountUsdc = escapeHtml(opts.amountUsdc);
  const chain = escapeHtml(opts.chain);
  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#111">
  <img src="${LOGO_SRC}" alt="Agent Control" width="180" style="display:block;margin:0 0 24px;max-width:180px;height:auto" />
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">Thank you</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">We received your payment. Your plan is active.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
    <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #eee">Invoice</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${invoiceId}</td></tr>
    <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #eee">Date</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${date}</td></tr>
    <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #eee">Plan</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${planName}</td></tr>
    <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #eee">Amount</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${amountUsdc} USDC</td></tr>
    <tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #eee">Network</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${chain}</td></tr>
    <tr><td style="padding:8px 0;color:#888">Status</td><td style="padding:8px 0;text-align:right">Paid</td></tr>
  </table>
  <p style="font-size:12px;line-height:1.5;color:#888">Questions: <a href="mailto:support@agent-control.net">support@agent-control.net</a></p>
</div>`;
  const text = `Agent Control

Thank you

We received your payment. Your plan is active.

Invoice: ${opts.invoiceId}
Date: ${opts.date}
Plan: ${opts.planName}
Amount: ${opts.amountUsdc} USDC
Network: ${opts.chain}
Status: Paid

Questions: support@agent-control.net
`;
  const result = await postResend({
    apiKey,
    to,
    subject: `Invoice ${opts.invoiceId} — Agent Control`,
    html,
    text,
  });
  if (!result.ok) {
    console.error("[billing] Resend invoice failed", result.status, result.body);
    return "skipped";
  }
  return "sent";
}
