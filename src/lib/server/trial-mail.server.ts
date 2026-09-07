import type { Sql } from "@/lib/db";
import { sendTrialEndingEmail } from "@/lib/auth/send-email.server";

/** Hour-20 window: 4 hours or less left on a 24-hour trial, still open. */
export function trialEndingWindow(nowMs = Date.now()): { from: string; to: string } {
  const fourHours = 4 * 60 * 60 * 1000;
  return {
    from: new Date(nowMs).toISOString(),
    to: new Date(nowMs + fourHours).toISOString(),
  };
}

export async function sendDueTrialEndingEmails(
  sql: Sql,
  nowMs = Date.now(),
): Promise<{ scanned: number; sent: number }> {
  const { from, to } = trialEndingWindow(nowMs);
  const rows = await sql.query<{ user_id: string; email: string | null }>(
    `select s.user_id, u.email
     from subscriptions s
     join "user" u on u.id = s.user_id
     where s.plan = 'free'
       and s.status = 'trialing'
       and s.trial_ends_at is not null
       and s.trial_ends_at > $1
       and s.trial_ends_at <= $2
       and s.trial_ending_sent_at is null`,
    [from, to],
  );
  let sent = 0;
  for (const row of rows) {
    const email = row.email?.trim();
    if (!email) continue;
    const ok = await sendTrialEndingEmail({ to: email });
    if (!ok) continue;
    const now = new Date(nowMs).toISOString();
    await sql.query(
      `update subscriptions set trial_ending_sent_at = $1 where user_id = $2 and trial_ending_sent_at is null`,
      [now, row.user_id],
    );
    sent += 1;
  }
  return { scanned: rows.length, sent };
}
