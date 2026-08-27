/**
 * Transactional mail via Resend. Used by Better Auth for signup confirmation
 * and by billing for thank-you invoices.
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
  const from = env("EMAIL_FROM") ?? "Agent Control <noreply@agent-control.net>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
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
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[auth] Resend failed", response.status, body);
    throw new Error("Could not send confirmation email");
  }
}

function formatInvoiceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Thank-you invoice after a pay request is confirmed paid. Returns false if skipped. */
export async function sendInvoiceEmail(opts: {
  to: string;
  invoiceId: string;
  date: string;
  planName: string;
  amountUsdc: string;
  chain: string;
}): Promise<boolean> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[billing] RESEND_API_KEY is not set; invoice email skipped");
    return false;
  }
  const invoiceId = escapeHtml(opts.invoiceId);
  const date = escapeHtml(formatInvoiceDate(opts.date));
  const planName = escapeHtml(opts.planName);
  const amount = escapeHtml(opts.amountUsdc);
  const chain = escapeHtml(opts.chain);
  const logo = "https://agent-control.net/logos/04-navbar-lockup.jpg";
  const from = env("EMAIL_FROM") ?? "Agent Control <noreply@agent-control.net>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: `Thank you — Agent Control ${opts.planName} invoice`,
      html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <img src="${logo}" alt="Agent Control" width="200" style="display:block;max-width:200px;height:auto;margin:0 0 24px;border:0" />
  <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">Thank you</h1>
  <p style="font-size:15px;line-height:1.55;color:#444;margin:0 0 24px">We received your USDC payment and your plan is now active. This is your invoice.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">
    <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Invoice</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;font-family:ui-monospace,monospace;font-size:12px">${invoiceId}</td></tr>
    <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Date</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${date}</td></tr>
    <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Plan</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${planName}</td></tr>
    <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Amount</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${amount} USDC</td></tr>
    <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Network</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${chain}</td></tr>
    <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Status</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;color:#15803d;font-weight:600">Paid</td></tr>
  </table>
  <p style="font-size:12px;line-height:1.5;color:#888;margin:28px 0 0">Questions? Email <a href="mailto:support@agent-control.net" style="color:#111">support@agent-control.net</a>.</p>
</div>`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[billing] Resend invoice failed", response.status, body);
    return false;
  }
  return true;
}
