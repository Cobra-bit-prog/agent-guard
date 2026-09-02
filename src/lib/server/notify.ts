import {
  sendWarningAlertEmail,
  warningAlertEmailCopy,
} from "@/lib/auth/send-email.server";
import { getSql } from "@/lib/db";
import {
  holdNoticeMessage,
  holdNoticeToken,
  inboxHoldEmailCopy,
  inboxHoldTelegramText,
  inboxHoldUrl,
  inboxHoldWebhookPayload,
  isHttpsWebhookUrl,
  postSlackIncomingWebhook,
  webhookLogChannel,
} from "@/lib/inbox-hold";
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

async function lookupUserEmail(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<string | null> {
  try {
    const users = await sql<{ email: string }>`
      select email from "user" where id = ${userId} limit 1
    `;
    return users[0]?.email?.trim() || null;
  } catch (err) {
    console.error("[notify] user email lookup failed", err);
    return null;
  }
}

async function sendTelegramHold(opts: {
  chatId: string;
  text: string;
}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[notify] telegram hold failed", response.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] telegram hold failed", err);
    return false;
  }
}

/**
 * Hold-only notify: email (if Email alerts on), Slack incoming webhook
 * (if webhook_url is https), and Telegram when the bot token + toggle + chat
 * id are all set. Deduped per approval id. Never throws — safe for /api/v1/check.
 */
export async function notifyInboxHold(opts: {
  userId: string;
  agentId: string;
  agentName: string;
  approvalId: string;
  message: string;
  valueUsd?: number;
  to?: string;
}): Promise<void> {
  try {
    const approvalId = opts.approvalId.trim();
    if (!approvalId) return;
    const sql = await getSql();
    const like = `${holdNoticeToken(approvalId)}%`;
    const already = await sql<{ id: string }>`
      select id from notification_log
      where user_id = ${opts.userId}
        and message like ${like}
      limit 1
    `;
    if (already[0]) return;

    const profile = await sql<{
      email_alerts: boolean | null;
      telegram_alerts: boolean | null;
      telegram_chat_id: string | null;
      webhook_url: string | null;
    }>`
      select email_alerts, telegram_alerts, telegram_chat_id, webhook_url
      from profiles where user_id = ${opts.userId} limit 1
    `;
    const ctaUrl = inboxHoldUrl(approvalId);
    const copy = inboxHoldEmailCopy({
      agentName: opts.agentName,
      message: opts.message,
      approvalId,
      valueUsd: opts.valueUsd,
      to: opts.to,
    });
    const logMessage = holdNoticeMessage(approvalId, opts.message);

    if (profile[0]?.email_alerts ?? true) {
      const to = await lookupUserEmail(sql, opts.userId);
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
        console.error("[notify] hold email skipped: no email for user");
      }
      await queueNotice(opts.userId, "email", logMessage);
    }

    const webhookUrl = String(profile[0]?.webhook_url ?? "").trim();
    if (isHttpsWebhookUrl(webhookUrl)) {
      const payload = inboxHoldWebhookPayload({
        agentName: opts.agentName,
        message: opts.message,
        approvalId,
        valueUsd: opts.valueUsd,
        to: opts.to,
        ctaUrl,
      });
      await postSlackIncomingWebhook(webhookUrl, payload);
      await queueNotice(opts.userId, webhookLogChannel(webhookUrl), logMessage);
    }

    const chatId = String(profile[0]?.telegram_chat_id ?? "").trim();
    const telegramOn = Boolean(profile[0]?.telegram_alerts);
    if (telegramOn && chatId && process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      const text = inboxHoldTelegramText({
        agentName: opts.agentName,
        message: opts.message,
        approvalId,
        valueUsd: opts.valueUsd,
        to: opts.to,
        ctaUrl,
      });
      await sendTelegramHold({ chatId, text });
      await queueNotice(opts.userId, "telegram", logMessage);
    }
  } catch (err) {
    console.error("[notify] inbox hold notify failed", err);
  }
}
