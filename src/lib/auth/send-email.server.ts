/**
 * Transactional mail via Resend. Used by Better Auth for signup confirmation.
 * Set RESEND_API_KEY (and optional EMAIL_FROM) on the Vercel project.
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
  const from = env("EMAIL_FROM") ?? "Agent Guard <beth.t@example.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: "Confirm your Agent Guard account",
      html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#111">
  <p>hello world</p>
  <p>Confirm your Agent Guard account. This link expires in one hour.</p>
  <p><a href="${safeUrl}">Confirm email</a></p>
  <p>Or copy this link:</p>
  <p><a href="${safeUrl}">${safeUrl}</a></p>
  <p>If you did not create an Agent Guard account, ignore this email.</p>
</div>`,
      text: `hello world

Confirm your Agent Guard account. This link expires in one hour.

${url}

If you did not create an Agent Guard account, ignore this email.`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[auth] Resend failed", response.status, body);
    throw new Error("Could not send confirmation email");
  }
}
