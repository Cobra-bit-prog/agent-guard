import {
  sendWarningAlertEmail,
  warningAlertEmailCopy,
} from "@/lib/auth/send-email.server";
import { getSql } from "@/lib/db";
import { uid } from "@/lib/utils";
import {
  WARNING_EMAIL_DEDUP_MS,
  absoluteAppUrl,
  isWithinDedupWindow,
  warningNoticeMessage,
  warningNoticeToken,
  type WarningAlertKind,
} from "@/lib/warning-alert";

export {
  shouldInsertNearLimitAlert,
  warningKindForDecision,
} from "@/lib/warning-alert";
export type { WarningAlertKind };

export async function queueNotice(userId: string, channel: string, message: string) {
  const sql = await getSql();
  await sql`
    insert into notification_log (id, user_id, channel, message)
    values (${uid()}, ${userId}, ${channel}, ${message})
  `;
}

/**
 * Send an optional warning email when Settings → Email alerts is on.
 * Always safe for /api/v1/check: logs errors and never throws.
 * Console `alerts` rows stay the caller's job.
 */
export async function notifyWarningAlert(opts: {
  userId: string;
  agentId: string;
  agentName: string;
  kind: WarningAlertKind;
  message: string;
  /** Override default CTA (on-chain holds already happened — use /alerts). */
  ctaPath?: string;
}): Promise<void> {
  try {
    const sql = await getSql();
    const profile = await sql<{ email_alerts: boolean | null }>`
      select email_alerts from profiles where user_id = ${opts.userId} limit 1
    `;
    if (!(profile[0]?.email_alerts ?? true)) return;

    const token = warningNoticeToken(opts.kind, opts.agentId);
    const since = new Date(Date.now() - WARNING_EMAIL_DEDUP_MS).toISOString();
    const like = `${token}%`;
    const recent = await sql<{ created_at: string }>`
      select created_at::text as created_at from notification_log
      where user_id = ${opts.userId}
        and channel = ${"email"}
        and message like ${like}
        and created_at >= ${since}
      order by created_at desc
      limit 1
    `;
    if (recent[0] && isWithinDedupWindow(recent[0].created_at, Date.now())) return;

    const copy = warningAlertEmailCopy({
      kind: opts.kind,
      agentName: opts.agentName,
      message: opts.message,
    });
    const ctaPath = opts.ctaPath ?? copy.ctaPath;
    const ctaUrl = absoluteAppUrl(ctaPath);

    let to: string | null = null;
    try {
      const users = await sql<{ email: string }>`
        select email from "user" where id = ${opts.userId} limit 1
      `;
      to = users[0]?.email?.trim() || null;
    } catch (err) {
      console.error("[notify] user email lookup failed", err);
    }

    if (to) {
      await sendWarningAlertEmail({
        to,
        subject: copy.subject,
        title: copy.title,
        bodyLines: copy.bodyLines,
        ctaUrl,
        ctaLabel: copy.ctaLabel,
      });
    } else {
      console.error("[notify] warning email skipped: no email for user");
    }

    await queueNotice(opts.userId, "email", warningNoticeMessage(opts.kind, opts.agentId, opts.message));
  } catch (err) {
    console.error("[notify] warning alert notify failed", err);
  }
}
