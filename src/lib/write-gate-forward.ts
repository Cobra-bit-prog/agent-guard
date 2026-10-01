/**
 * Write Gate forward adapters.
 * email.send → Agentmail when the human connected an inbox.
 * slack.post → the Slack incoming webhook already stored for Inbox alerts.
 * crm.write → the human's CRM webhook. POST the approved preview.
 * A missing connection is a stop. Nothing is sent in its place.
 */
import { postSlackIncomingWebhook, type SlackIncomingWebhookPayload } from "./inbox-hold.ts";
import {
  connectionBlock,
  type WriteForwardJob,
  type WriteForwardResult,
} from "./write-gate.ts";

export const AGENTMAIL_API_ENV = "AGENTMAIL_API_KEY";

export function agentmailSendUrl(inboxId: string): string {
  return `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`;
}

export function emailReady(
  inboxId: string | null | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(inboxId?.trim() && env[AGENTMAIL_API_ENV]?.trim());
}

export function crmForwardBody(job: WriteForwardJob): {
  action_type: "crm.write";
  approval_id: string;
  summary: string;
  preview: string;
  target: string | null;
} {
  return {
    action_type: "crm.write",
    approval_id: job.approvalId,
    summary: job.summary,
    preview: job.preview,
    target: job.target,
  };
}

function slackPayload(text: string): SlackIncomingWebhookPayload {
  return {
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  };
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  return response.ok;
}

export async function deliverWrite(
  job: WriteForwardJob,
  deps?: {
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    postSlack?: (url: string, payload: SlackIncomingWebhookPayload) => Promise<boolean>;
  },
): Promise<WriteForwardResult> {
  const block = connectionBlock(job.tool, job.connections);
  if (block) return { ok: false, message: block };
  const fetchImpl = deps?.fetch ?? fetch;
  const env = deps?.env ?? process.env;

  try {
    if (job.tool === "email.send") {
      const inbox = job.connections.agentmailInboxId?.trim() ?? "";
      const key = env[AGENTMAIL_API_ENV]?.trim() ?? "";
      const to = job.target?.trim() ?? "";
      if (!inbox || !key || !to) {
        return { ok: false, message: "Connect email in Settings before Write Gate can send. Nothing was sent." };
      }
      const ok = await postJson(
        agentmailSendUrl(inbox),
        { to: [to], subject: job.summary, text: job.preview },
        { Authorization: `Bearer ${key}` },
        fetchImpl,
      );
      if (!ok) return { ok: false, message: "Email was not sent. Try again with the same approval_id." };
      return { ok: true, destination: "email" };
    }

    if (job.tool === "slack.post") {
      const url = job.connections.slackWebhookUrl?.trim() ?? "";
      const post = deps?.postSlack ?? postSlackIncomingWebhook;
      const ok = await post(url, slackPayload(job.preview));
      if (!ok) return { ok: false, message: "Slack was not posted. Try again with the same approval_id." };
      return { ok: true, destination: "slack" };
    }

    const url = job.connections.crmWebhookUrl?.trim() ?? "";
    const ok = await postJson(url, crmForwardBody(job), {}, fetchImpl);
    if (!ok) return { ok: false, message: "CRM webhook did not accept the write. Try again with the same approval_id." };
    return { ok: true, destination: "crm" };
  } catch (err) {
    console.error("[write-gate] forward failed", err instanceof Error ? err.name : "error");
    return { ok: false, message: "Write Gate could not forward. Nothing else was sent." };
  }
}
