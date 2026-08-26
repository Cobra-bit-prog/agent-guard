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

export async function sendConfirmationEmail(opts: {
  to: string;
  url: string;
}): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[auth] RESEND_API_KEY is not set; confirmation email skipped");
    return;
  }
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
  <p style="font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#b45309;font-weight:600">Agent Guard</p>
  <h1 style="font-size:22px;line-height:1.3;margin:12px 0 16px">Confirm your email</h1>
  <p style="font-size:15px;line-height:1.55;color:#444">Click the button to confirm this account. The link expires in one hour.</p>
  <p style="margin:28px 0"><a href="${opts.url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600">Confirm email</a></p>
  <p style="font-size:12px;line-height:1.5;color:#888">If you did not create an Agent Guard account, ignore this email.</p>
</div>`,
      text: `Confirm your Agent Guard account:\n${opts.url}\n\nIf you did not create an account, ignore this email.`,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[auth] Resend failed", response.status, body);
    throw new Error("Could not send confirmation email");
  }
}
