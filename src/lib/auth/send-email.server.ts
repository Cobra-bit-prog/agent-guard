/**
 * Transactional mail via Resend. Used by Better Auth for signup confirmation.
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
