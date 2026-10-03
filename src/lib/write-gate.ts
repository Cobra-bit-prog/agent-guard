/**
 * Write Gate — the enforce half of Action Gate.
 * Hosted tools validate, call check_action fail-closed, and forward only on go.
 * Same $49 seat (plan=action). Not a second SKU.
 * Wait returns approval_id; the agent polls get_approval, then calls the tool again.
 */
import {
  ACTION_GATE_HREF,
  ACTION_GATE_PLAN,
  ACTION_GATE_PRICE_USD,
  type ActionGateResult,
  type CheckActionOutcome,
} from "./action-gate.ts";
import { isHttpsWebhookUrl } from "./inbox-hold.ts";

export { ACTION_GATE_HREF, ACTION_GATE_PLAN, ACTION_GATE_PRICE_USD };

export const WRITE_GATE_TOOLS = ["email.send", "slack.post", "crm.write"] as const;
export type WriteToolName = (typeof WRITE_GATE_TOOLS)[number];

export const WRITE_GATE_ASK_VS_ENFORCE =
  "Ask: call check_action (or ask_human). The agent still executes after go. Enforce: call the Write Gate tools email.send, slack.post, and crm.write. Those tools run the same check, then forward only when the decision is go. If the decision is wait, poll get_approval and call the tool again with approval_id. The agent cannot skip the check. Same $49 Action Gate seat (plan=action). Not a second plan.";

export const WRITE_GATE_BILLING_LINE =
  "Action Gate is $49 a month in USDC on Solana (plan=action). Before Slack or a CRM write, you tap go, stop, or wait. If you do not answer, it stops. You keep the keys. Email send stops until email is connected.";

export const WRITE_GATE_POLL =
  "Poll get_approval with approval_id. When the decision is go, call this tool again with approval_id. Write Gate forwards only on go.";

export const WRITE_GATE_EMAIL_CONNECT =
  "Connect email in Settings before Write Gate can send. Nothing was sent.";

export const WRITE_GATE_SLACK_CONNECT =
  "Save a Slack incoming webhook in Settings before Write Gate can post. Nothing was posted.";

export const WRITE_GATE_CRM_CONNECT =
  "Save a CRM webhook URL in Settings before Write Gate can write. Nothing was posted.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WriteConnections = {
  slackWebhookUrl: string | null;
  crmWebhookUrl: string | null;
  agentmailInboxId: string | null;
  /** True only when the human saved an Agentmail inbox and the mail path can send. */
  emailReady: boolean;
};

export type ApprovedWrite = {
  id: string;
  actionType: string;
  summary: string;
  preview: string;
  target: string | null;
};

export type WriteForwardJob = {
  tool: WriteToolName;
  approvalId: string;
  summary: string;
  preview: string;
  target: string | null;
  connections: WriteConnections;
};

export type WriteForwardResult =
  | { ok: true; destination: "email" | "slack" | "crm" }
  | { ok: false; message: string };

export type WriteGateResult = ActionGateResult & {
  forwarded: boolean;
  already_forwarded?: boolean;
  destination?: "email" | "slack" | "crm";
};

export type WriteGateCall =
  | { ok: false; status: number; error: string }
  | { ok: true; status: number; result: WriteGateResult };

export function isWriteGateTool(name: string): name is WriteToolName {
  return (WRITE_GATE_TOOLS as readonly string[]).includes(name);
}

export function connectionBlock(tool: WriteToolName, connections: WriteConnections): string | null {
  if (tool === "email.send") {
    return connections.emailReady ? null : WRITE_GATE_EMAIL_CONNECT;
  }
  if (tool === "slack.post") {
    const url = connections.slackWebhookUrl?.trim() ?? "";
    return isHttpsWebhookUrl(url) ? null : WRITE_GATE_SLACK_CONNECT;
  }
  const url = connections.crmWebhookUrl?.trim() ?? "";
  return isHttpsWebhookUrl(url) ? null : WRITE_GATE_CRM_CONNECT;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateWriteArgs(
  tool: WriteToolName,
  args: Record<string, unknown>,
):
  | { ok: true; mode: "resume"; approvalId: string }
  | {
      ok: true;
      mode: "open";
      body: {
        action_type: WriteToolName;
        summary: string;
        preview: string;
        target: string | null;
        risk: string | null;
      };
    }
  | { ok: false; error: string } {
  const approvalId = text(args.approval_id);
  if (approvalId) {
    if (approvalId.length > 80) return { ok: false, error: "approval_id is too long." };
    return { ok: true, mode: "resume", approvalId };
  }

  const risk = text(args.risk).toLowerCase();
  if (tool === "email.send") {
    const to = text(args.to);
    const subject = text(args.subject);
    const body = text(args.text ?? args.preview);
    if (!to || !EMAIL_RE.test(to) || to.length > 200) {
      return { ok: false, error: "Provide to as one email address." };
    }
    if (!subject || subject.length > 280) {
      return { ok: false, error: "Provide subject (280 characters or fewer)." };
    }
    if (!body || body.length > 4000) {
      return { ok: false, error: "Provide text (4000 characters or fewer)." };
    }
    return {
      ok: true,
      mode: "open",
      body: {
        action_type: tool,
        summary: subject,
        preview: body,
        target: to,
        risk: risk || null,
      },
    };
  }

  if (tool === "slack.post") {
    const message = text(args.text ?? args.preview);
    const channel = text(args.channel ?? args.target);
    const summary = text(args.summary) || message.slice(0, 280);
    if (!message || message.length > 4000) {
      return { ok: false, error: "Provide text (4000 characters or fewer)." };
    }
    if (channel.length > 200) return { ok: false, error: "channel must be 200 characters or fewer." };
    if (!summary || summary.length > 280) {
      return { ok: false, error: "Provide summary (280 characters or fewer)." };
    }
    return {
      ok: true,
      mode: "open",
      body: {
        action_type: tool,
        summary,
        preview: message,
        target: channel || null,
        risk: risk || null,
      },
    };
  }

  const summary = text(args.summary);
  const preview = text(args.preview);
  const payload = args.payload;
  let stored = preview;
  if (payload !== undefined && payload !== null) {
    if (typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "payload must be an object." };
    }
    let encoded = "";
    try {
      encoded = JSON.stringify(payload);
    } catch {
      return { ok: false, error: "payload must be JSON." };
    }
    stored = preview ? `${preview}\n${encoded}` : encoded;
  }
  const target = text(args.target);
  if (!summary || summary.length > 280) {
    return { ok: false, error: "Provide summary (280 characters or fewer)." };
  }
  if (!stored || stored.length > 4000) {
    return { ok: false, error: "Provide preview (4000 characters or fewer)." };
  }
  if (target.length > 200) return { ok: false, error: "target must be 200 characters or fewer." };
  return {
    ok: true,
    mode: "open",
    body: {
      action_type: tool,
      summary,
      preview: stored,
      target: target || null,
      risk: risk || null,
    },
  };
}

function present(
  result: ActionGateResult,
  forwarded: boolean,
  extra?: Partial<WriteGateResult>,
): WriteGateResult {
  const reasons = [...result.reasons];
  if (result.decision === "wait" && !reasons.some((line) => line.includes("get_approval"))) {
    reasons.push(WRITE_GATE_POLL);
  }
  return { ...result, reasons, forwarded, ...extra };
}

function stopped(
  status: number,
  reasons: string[],
  approvalId: string | null,
  actionType?: string,
): WriteGateCall {
  return {
    ok: true,
    status,
    result: {
      decision: "stop",
      reasons,
      must_abort: true,
      approval_id: approvalId,
      poll_url: approvalId ? `/api/v1/approvals/${approvalId}` : null,
      action_type: actionType,
      forwarded: false,
    },
  };
}

async function forwardOnce(opts: {
  tool: WriteToolName;
  approvalId: string;
  row: ApprovedWrite;
  polled: ActionGateResult;
  connections: WriteConnections;
  claim: (approvalId: string) => Promise<boolean>;
  release: (approvalId: string) => Promise<void>;
  deliver: (job: WriteForwardJob) => Promise<WriteForwardResult>;
}): Promise<WriteGateCall> {
  if (opts.row.actionType !== opts.tool) {
    return stopped(
      200,
      [`This approval is for ${opts.row.actionType}. Nothing was sent.`],
      opts.approvalId,
      opts.tool,
    );
  }
  const block = connectionBlock(opts.tool, opts.connections);
  if (block) return stopped(200, [block], opts.approvalId, opts.tool);

  const claimed = await opts.claim(opts.approvalId);
  if (!claimed) {
    return {
      ok: true,
      status: 200,
      result: present(opts.polled, true, {
        already_forwarded: true,
        forwarded: true,
        reasons: ["Already forwarded once. Write Gate did not send again."],
      }),
    };
  }

  const job: WriteForwardJob = {
    tool: opts.tool,
    approvalId: opts.approvalId,
    summary: opts.row.summary,
    preview: opts.row.preview,
    target: opts.row.target,
    connections: opts.connections,
  };
  const sent = await opts.deliver(job);
  if (!sent.ok) {
    await opts.release(opts.approvalId);
    return stopped(200, [sent.message], opts.approvalId, opts.tool);
  }
  return {
    ok: true,
    status: 200,
    result: present(opts.polled, true, {
      forwarded: true,
      destination: sent.destination,
      reasons: ["Allowed once. Write Gate forwarded this action."],
    }),
  };
}

export async function runWriteGate(opts: {
  tool: WriteToolName;
  args: Record<string, unknown>;
  open: (body: {
    action_type: string;
    summary: string;
    preview: string;
    target: string | null;
    risk: string | null;
  }) => Promise<CheckActionOutcome>;
  poll: (approvalId: string) => Promise<CheckActionOutcome>;
  readApproved: (approvalId: string) => Promise<ApprovedWrite | null>;
  connections: () => Promise<WriteConnections>;
  claim: (approvalId: string) => Promise<boolean>;
  release: (approvalId: string) => Promise<void>;
  deliver: (job: WriteForwardJob) => Promise<WriteForwardResult>;
}): Promise<WriteGateCall> {
  const parsed = validateWriteArgs(opts.tool, opts.args);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  if (parsed.mode === "open") {
    const opened = await opts.open(parsed.body);
    if (!opened.ok) return opened;
    if (opened.result.decision !== "go" || opened.result.must_abort || !opened.result.approval_id) {
      return {
        ok: true,
        status: opened.status,
        result: present(opened.result, false),
      };
    }
    const row = await opts.readApproved(opened.result.approval_id);
    if (!row) return stopped(200, ["Write Gate could not read the approval. Nothing was sent."], opened.result.approval_id, opts.tool);
    return forwardOnce({
      tool: opts.tool,
      approvalId: opened.result.approval_id,
      row,
      polled: opened.result,
      connections: await opts.connections(),
      claim: opts.claim,
      release: opts.release,
      deliver: opts.deliver,
    });
  }

  const polled = await opts.poll(parsed.approvalId);
  if (!polled.ok) return polled;
  if (polled.result.decision !== "go" || polled.result.must_abort) {
    return { ok: true, status: polled.status, result: present(polled.result, false) };
  }
  const row = await opts.readApproved(parsed.approvalId);
  if (!row) {
    return stopped(200, ["Write Gate could not read the approval. Nothing was sent."], parsed.approvalId, opts.tool);
  }
  return forwardOnce({
    tool: opts.tool,
    approvalId: parsed.approvalId,
    row,
    polled: polled.result,
    connections: await opts.connections(),
    claim: opts.claim,
    release: opts.release,
    deliver: opts.deliver,
  });
}
