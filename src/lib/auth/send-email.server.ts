/**
 * Transactional mail via Resend. Used by Better Auth for signup confirmation,
 * billing thank-you invoices, admin new-subscriber notifies, and optional
 * operator warning alerts (hold / policy alert / near-limit / block).
 * Set RESEND_API_KEY (and optional EMAIL_FROM) on the Vercel project.
 * EMAIL_FROM on Vercel is Agent Control <noreply@agent-control.net>.
 * Admin notifies go to STATS_REPORT_EMAIL.
 */
import type { WarningAlertKind } from "../warning-alert.ts";

export type { WarningAlertKind };

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

export type NewSubscriberNotifyKind = "trial" | "paid";

export type NewSubscriberNotifyOpts = {
  kind: NewSubscriberNotifyKind;
  planName: string;
  at: string;
  userEmail?: string | null;
  payRequestId?: string | null;
  chain?: string | null;
};

export function newSubscriberNotifySubject(opts: {
  kind: NewSubscriberNotifyKind;
  planName: string;
}): string {
  if (opts.kind === "trial") return "New subscriber — Free trial";
  return `New subscriber — Paid ${opts.planName}`;
}

export function newSubscriberNotifyText(opts: NewSubscriberNotifyOpts): string {
  const kindLabel = opts.kind === "trial" ? "Free trial start" : "Paid confirmation";
  const lines = [
    `New subscriber — ${kindLabel}`,
    "",
    `Kind: ${kindLabel}`,
    `Plan: ${opts.planName}`,
    `When: ${opts.at}`,
  ];
  const email = opts.userEmail?.trim();
  if (email) lines.push(`User: ${email}`);
  const payRequestId = opts.payRequestId?.trim();
  if (payRequestId) lines.push(`Pay request: ${payRequestId}`);
  const chain = opts.chain?.trim();
  if (chain) lines.push(`Network: ${chain}`);
  return lines.join("\n");
}

/**
 * Admin ping on every new subscription activation (trial start or paid confirm).
 * Sends to STATS_REPORT_EMAIL. Skip + log if unset. Never throws.
 */
export async function sendNewSubscriberNotifyEmail(
  opts: NewSubscriberNotifyOpts,
): Promise<void> {
  try {
    const to = env("STATS_REPORT_EMAIL");
    if (!to) {
      console.error("[notify] STATS_REPORT_EMAIL is not set; new-subscriber email skipped");
      return;
    }
    const apiKey = env("RESEND_API_KEY");
    if (!apiKey) {
      console.error("[notify] RESEND_API_KEY is not set; new-subscriber email skipped");
      return;
    }
    const from = env("EMAIL_FROM") ?? "Agent Control <noreply@agent-control.net>";
    const subject = newSubscriberNotifySubject(opts);
    const text = newSubscriberNotifyText(opts);
    const kindLabel = opts.kind === "trial" ? "Free trial start" : "Paid confirmation";
    const planName = escapeHtml(opts.planName);
    const at = escapeHtml(opts.at);
    const email = opts.userEmail?.trim();
    const payRequestId = opts.payRequestId?.trim();
    const chain = opts.chain?.trim();
    const rows = [
      `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Kind</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${escapeHtml(kindLabel)}</td></tr>`,
      `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Plan</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${planName}</td></tr>`,
      `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">When</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;font-family:ui-monospace,monospace;font-size:12px">${at}</td></tr>`,
    ];
    if (email) {
      rows.push(
        `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">User</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${escapeHtml(email)}</td></tr>`,
      );
    }
    if (payRequestId) {
      rows.push(
        `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Pay request</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;font-family:ui-monospace,monospace;font-size:12px">${escapeHtml(payRequestId)}</td></tr>`,
      );
    }
    if (chain) {
      rows.push(
        `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">Network</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee">${escapeHtml(chain)}</td></tr>`,
      );
    }
    const intro =
      opts.kind === "trial"
        ? "A free trial just started on Agent Control."
        : "A paid subscription was just confirmed on Agent Control.";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">${escapeHtml(subject)}</h1>
  <p style="font-size:15px;line-height:1.55;color:#444;margin:0 0 24px">${intro}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">
    ${rows.join("")}
  </table>
</div>`,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[notify] Resend new-subscriber failed", response.status, body);
    }
  } catch (err) {
    console.error("[notify] new-subscriber email failed", err);
  }
}

export type WarningAlertEmailCopy = {
  subject: string;
  title: string;
  bodyLines: string[];
  ctaPath: "/inbox" | "/alerts";
  ctaLabel: string;
};

export function warningAlertEmailCopy(opts: {
  kind: WarningAlertKind;
  agentName: string;
  message: string;
}): WarningAlertEmailCopy {
  const agent = opts.agentName.trim() || "An agent";
  const detail = opts.message.trim();
  if (opts.kind === "hold") {
    return {
      subject: "Agent Control: hold needs a look",
      title: "A spend is waiting for you",
      bodyLines: [
        `${agent} has a hold in Approval Inbox.`,
        ...(detail ? [detail] : []),
        "Allow once, always allow this address, or block. Holds expire in 10 minutes.",
      ],
      ctaPath: "/inbox",
      ctaLabel: "Open Approval Inbox",
    };
  }
  if (opts.kind === "near_limit") {
    return {
      subject: "Agent Control: near daily limit",
      title: "Spend is approaching the daily cap",
      bodyLines: [
        `${agent} is near its daily spend limit.`,
        ...(detail ? [detail] : []),
        "This send was still allowed. Review the console if you want to pause or tighten the cap.",
      ],
      ctaPath: "/alerts",
      ctaLabel: "Open alerts",
    };
  }
  if (opts.kind === "block") {
    return {
      subject: "Agent Control: spend blocked",
      title: "A spend was blocked",
      bodyLines: [
        `${agent} was blocked by policy.`,
        ...(detail ? [detail] : []),
        "Paused agents and denylisted destinations are a hard block. The agent must not send.",
      ],
      ctaPath: "/alerts",
      ctaLabel: "Open alerts",
    };
  }
  return {
    subject: "Agent Control: policy alert",
    title: "Suspicious or over-threshold spend",
    bodyLines: [
      `${agent} crossed an alert threshold.`,
      ...(detail ? [detail] : []),
      "The check was allowed (not blocked). Review the console if this looks wrong.",
    ],
    ctaPath: "/alerts",
    ctaLabel: "Open alerts",
  };
}

export function warningAlertEmailText(opts: {
  title: string;
  bodyLines: string[];
  ctaUrl: string;
  ctaLabel: string;
}): string {
  return [
    "Agent-Control.net",
    "",
    opts.title,
    "",
    ...opts.bodyLines,
    "",
    `${opts.ctaLabel}:`,
    opts.ctaUrl,
  ].join("\n");
}

/**
 * Optional operator warning (hold / policy alert / near-limit / block).
 * Returns false if skipped or Resend failed. Never throws.
 */
export async function sendWarningAlertEmail(opts: {
  to: string;
  subject: string;
  title: string;
  bodyLines: string[];
  ctaUrl: string;
  ctaLabel: string;
}): Promise<boolean> {
  try {
    const apiKey = env("RESEND_API_KEY");
    if (!apiKey) {
      console.error("[notify] RESEND_API_KEY is not set; warning email skipped");
      return false;
    }
    const to = opts.to.trim();
    const ctaUrl = opts.ctaUrl.trim();
    if (!to || !ctaUrl) {
      console.error("[notify] warning email skipped: missing to or ctaUrl");
      return false;
    }
    const from = env("EMAIL_FROM") ?? "Agent Control <noreply@agent-control.net>";
    const safeUrl = escapeHtml(ctaUrl);
    const paragraphs = opts.bodyLines
      .map(
        (line) =>
          `<p style="font-size:15px;line-height:1.55;color:#444;margin:0 0 12px">${escapeHtml(line)}</p>`,
      )
      .join("");
    const text = warningAlertEmailText(opts);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: opts.subject,
        text,
        html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;color:#111">
  <p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#b45309;font-weight:600">Agent-Control.net</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">${escapeHtml(opts.title)}</h1>
  ${paragraphs}
  <p style="margin:24px 0"><a href="${safeUrl}">${escapeHtml(opts.ctaLabel)}</a></p>
  <p style="font-size:12px;line-height:1.5;color:#888">Questions? Email <a href="mailto:support@agent-control.net" style="color:#111">support@agent-control.net</a>.</p>
</div>`,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[notify] Resend warning email failed", response.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] warning email failed", err);
    return false;
  }
}
