import { getSql } from "@/lib/db";
import { storageFailureStop } from "@/lib/action-gate";
import { checkActionIntent, pollActionIntent } from "@/lib/server/action-gate";
import { deliverWrite, emailReady } from "@/lib/write-gate-forward";
import {
  runWriteGate,
  type ApprovedWrite,
  type WriteConnections,
  type WriteGateCall,
  type WriteToolName,
} from "@/lib/write-gate";
import { uid } from "@/lib/utils";

function blankConnections(): WriteConnections {
  return {
    slackWebhookUrl: null,
    crmWebhookUrl: null,
    agentmailInboxId: null,
    emailReady: false,
  };
}

async function connectionsForKey(apiKey: string): Promise<WriteConnections> {
  const sql = await getSql();
  const rows = await sql<{
    webhook_url: string | null;
    crm_webhook_url: string | null;
    agentmail_inbox_id: string | null;
  }>`
    select profiles.webhook_url, profiles.crm_webhook_url, profiles.agentmail_inbox_id
    from profiles
    join agents on agents.user_id = profiles.user_id
    where agents.api_key = ${apiKey}
    limit 1
  `;
  const row = rows[0];
  if (!row) return blankConnections();
  const inbox = row.agentmail_inbox_id?.trim() || null;
  return {
    slackWebhookUrl: row.webhook_url?.trim() || null,
    crmWebhookUrl: row.crm_webhook_url?.trim() || null,
    agentmailInboxId: inbox,
    emailReady: emailReady(inbox),
  };
}

async function readApproved(apiKey: string, approvalId: string): Promise<ApprovedWrite | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    action_type: string;
    summary: string;
    preview: string;
    target: string | null;
  }>`
    select action_approvals.id, action_approvals.action_type, action_approvals.summary,
           action_approvals.preview, action_approvals.target
    from action_approvals
    join agents on agents.id = action_approvals.agent_id
    where action_approvals.id = ${approvalId} and agents.api_key = ${apiKey}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    actionType: String(row.action_type),
    summary: String(row.summary),
    preview: String(row.preview),
    target: row.target ? String(row.target) : null,
  };
}

async function claimForward(apiKey: string, approvalId: string, nowIso: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update action_approvals
    set forwarded_at = ${nowIso}
    where id = ${approvalId}
      and status = ${"allow"}
      and forwarded_at is null
      and agent_id in (select id from agents where api_key = ${apiKey})
    returning id
  `;
  return Boolean(rows[0]?.id);
}

async function releaseForward(apiKey: string, approvalId: string, nowIso: string): Promise<void> {
  const sql = await getSql();
  await sql`
    update action_approvals
    set forwarded_at = null
    where id = ${approvalId}
      and forwarded_at = ${nowIso}
      and agent_id in (select id from agents where api_key = ${apiKey})
  `;
}

async function auditForward(apiKey: string, job: { tool: string; approvalId: string; target: string | null }): Promise<void> {
  const sql = await getSql();
  const agents = await sql<{ id: string; user_id: string }>`
    select id, user_id from agents where api_key = ${apiKey} limit 1
  `;
  const agent = agents[0];
  if (!agent) return;
  const target = job.target ? ` target=${job.target}` : "";
  await sql`
    insert into audit_events (id, user_id, agent_id, action, detail)
    values (
      ${uid()},
      ${String(agent.user_id)},
      ${String(agent.id)},
      ${"write_forward"},
      ${`FORWARD ${job.tool}${target} approval=${job.approvalId}`}
    )
  `;
}

export async function executeWriteTool(input: {
  apiKey: string;
  tool: WriteToolName;
  args: Record<string, unknown>;
  now?: number;
}): Promise<WriteGateCall> {
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  try {
    return await runWriteGate({
      tool: input.tool,
      args: input.args,
      open: (body) => checkActionIntent({ apiKey: input.apiKey, body, now }),
      poll: (approvalId) => pollActionIntent({ apiKey: input.apiKey, approvalId, now }),
      readApproved: (approvalId) => readApproved(input.apiKey, approvalId),
      connections: () => connectionsForKey(input.apiKey),
      claim: (approvalId) => claimForward(input.apiKey, approvalId, nowIso),
      release: (approvalId) => releaseForward(input.apiKey, approvalId, nowIso),
      deliver: async (job) => {
        const sent = await deliverWrite(job);
        if (!sent.ok) return sent;
        try {
          await auditForward(input.apiKey, job);
        } catch (err) {
          console.error("[write-gate] audit failed", err instanceof Error ? err.name : "error");
        }
        return sent;
      },
    });
  } catch (err) {
    console.error("[write-gate] storage unavailable", err instanceof Error ? err.name : "error");
    return {
      ok: true,
      status: 503,
      result: { ...storageFailureStop(), forwarded: false },
    };
  }
}
