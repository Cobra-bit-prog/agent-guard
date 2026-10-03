/**
 * Action Gate — humans pay $49/mo so agents stop-and-ask before consequential
 * non-money actions (email, Slack, CRM, deploy).
 * Ask (check_action): the agent still executes after go.
 * Enforce (Write Gate tools): we forward only on go.
 *
 * Durable state lives in Postgres (Neon) when DATABASE_URL is set.
 * migrations/0022_action_gate.sql is the schema. If DATABASE_URL is missing
 * the gate fails closed (stop) and does not use an in-process map.
 */
import { HOLD_TTL_MS } from "./hold.ts";
import {
  ACTION_GATE_HREF,
  ACTION_GATE_PLAN,
  ACTION_GATE_PRICE_USD,
  ACTION_GATE_PRODUCT,
} from "./shop-shield.ts";
import { absoluteAppUrl } from "./warning-alert.ts";

export {
  ACTION_GATE_HREF,
  ACTION_GATE_PLAN,
  ACTION_GATE_PRICE_USD,
  ACTION_GATE_PRODUCT,
};

/** Env var Product must set before Action Gate can store decisions. */
export const ACTION_GATE_DB_ENV = "DATABASE_URL";

export const ACTION_GATE_SCHEMA = "migrations/0022_action_gate.sql";

export const ACTION_GATE_DB_ERROR =
  "Action Gate requires DATABASE_URL (Neon Postgres). Decisions are not stored until it is set. The gate fails closed (stop). Apply migrations/0022_action_gate.sql with npm run db:migrate on that database.";

export const ACTION_GATE_PAY_URL = ACTION_GATE_HREF;

/** Full pay link so an unpaid stop is one click, including from an API response. */
export const ACTION_GATE_PAY_ABSOLUTE = absoluteAppUrl(ACTION_GATE_HREF);

export const ACTION_GATE_PAY_CTA = "Pay $49";

/** Plain stop a stranger can read on docs and Connect. Slack and CRM only. */
export const ACTION_GATE_STOP_EXAMPLE =
  "The agent wants to post in Slack: \"We are investigating the checkout errors.\" Nothing goes out. You tap go, stop, or wait. If you do not answer in 10 minutes, it stops. A CRM write waits the same way. After you tap go, that Slack post or CRM write can go out. You keep the keys.";

/** Email send is not live. Do not describe it as working. */
export const ACTION_GATE_EMAIL_NOTE =
  "Email send stops until email is connected. Nothing is sent.";

export const ACTION_GATE_COPY = {
  title: "Action Gate — $49. Ask before the agent acts.",
  body: "Send $49 USDC on Solana. Agents must stop and ask before email, Slack, CRM writes, and deploys. Write Gate tools forward only after you allow once. Same $49 seat.",
  cta: "Pay $49",
  waiting: "Waiting for $49 USDC on Solana.",
  done: "Paid. Action Gate is on for 30 days.",
  warn: "Use a wallet. Do not send from Coinbase or Binance.",
  trialMail: "Action Gate is $49 a month. Agents stop and ask before they act.",
} as const;

export const ACTION_TIMEOUT_IS_STOP =
  "If you do nothing, the hold expires in 10 minutes and the agent must stop.";

export type ActionDecision = "go" | "stop" | "wait";
export type ActionStatus = "hold" | "allow" | "block" | "expired";
export type ActionChannel = "request" | "inbox" | "timeout";

export type ActionGateRecord = {
  id: string;
  userId: string;
  agentId: string;
  actionType: string;
  summary: string;
  preview: string;
  target: string | null;
  risk: string | null;
  status: ActionStatus;
  expiresAt: string;
  decidedAt: string | null;
  channel: string | null;
  createdAt: string;
};

export type ActionGateAuditEvent = {
  userId: string;
  agentId: string | null;
  action: string;
  detail: string;
};

export interface ActionGateStore {
  entitled(userId: string, now: number): Promise<boolean>;
  insert(row: ActionGateRecord): Promise<void>;
  getById(id: string): Promise<ActionGateRecord | null>;
  listOpen(userId: string, now: number): Promise<ActionGateRecord[]>;
  save(row: ActionGateRecord): Promise<void>;
  /** Returns the row only when this call transitioned hold → expired. */
  markExpired(id: string, nowIso: string): Promise<ActionGateRecord | null>;
  audit(event: ActionGateAuditEvent): Promise<void>;
}

export type ActionGateResult = {
  decision: ActionDecision;
  reasons: string[];
  must_abort: boolean;
  approval_id: string | null;
  poll_url: string | null;
  poll_after_ms?: number;
  expires_in_s?: number;
  action_type?: string;
  summary?: string;
  target?: string | null;
  agent_id?: string;
  agent?: string;
  pay_url?: string;
  status?: ActionStatus;
};

export type CheckActionOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; status: number; result: ActionGateResult };

const ACTION_TYPE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const RISK_RE = /^[a-z0-9_-]{1,32}$/;

export function actionGateDatabaseReady(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env[ACTION_GATE_DB_ENV]?.trim());
}

export function decisionFromStatus(status: ActionStatus): ActionDecision {
  if (status === "allow") return "go";
  if (status === "hold") return "wait";
  return "stop";
}

export function actionAuditDetail(input: {
  verdict: ActionDecision;
  actionType: string;
  target: string | null;
  channel: ActionChannel;
  who: string;
}): string {
  const target = input.target ? ` target=${input.target}` : "";
  return `${input.verdict.toUpperCase()} ${input.actionType}${target} channel=${input.channel} who=${input.who}`;
}

export function validateActionBody(body: {
  action_type?: unknown;
  summary?: unknown;
  preview?: unknown;
  target?: unknown;
  risk?: unknown;
}):
  | {
      ok: true;
      actionType: string;
      summary: string;
      preview: string;
      target: string | null;
      risk: string | null;
    }
  | { ok: false; error: string } {
  const actionType = String(body.action_type ?? "")
    .trim()
    .toLowerCase();
  const summary = String(body.summary ?? "").trim();
  const preview = String(body.preview ?? "").trim();
  const targetRaw = body.target == null ? "" : String(body.target).trim();
  const riskRaw = body.risk == null ? "" : String(body.risk).trim().toLowerCase();

  if (!ACTION_TYPE_RE.test(actionType)) {
    return {
      ok: false,
      error: "Provide action_type (for example email.send, slack.post, or crm.write).",
    };
  }
  if (!summary || summary.length > 280) {
    return { ok: false, error: "Provide summary (280 characters or fewer)." };
  }
  if (!preview || preview.length > 4000) {
    return { ok: false, error: "Provide preview (4000 characters or fewer)." };
  }
  if (targetRaw.length > 200) {
    return { ok: false, error: "target must be 200 characters or fewer." };
  }
  if (riskRaw && !RISK_RE.test(riskRaw)) {
    return { ok: false, error: "risk must be a short tag such as low, medium, or high." };
  }
  return {
    ok: true,
    actionType,
    summary,
    preview,
    target: targetRaw || null,
    risk: riskRaw || null,
  };
}

function resultFromRecord(
  row: ActionGateRecord,
  now: number,
  extra?: { agent?: string; reasons?: string[] },
): ActionGateResult {
  const decision = decisionFromStatus(row.status);
  const expiresInS = Math.max(0, Math.round((new Date(row.expiresAt).getTime() - now) / 1000));
  const reasons =
    extra?.reasons ??
    (decision === "wait"
      ? ["Waiting for a human. No decision in 10 minutes = stop."]
      : decision === "go"
        ? ["Allowed once. The agent may do this action."]
        : row.status === "expired"
          ? ["No decision before the timeout. Stop."]
          : ["Blocked. Do not do this action."]);
  return {
    decision,
    reasons,
    must_abort: decision !== "go",
    approval_id: row.id,
    poll_url: `/api/v1/approvals/${row.id}`,
    poll_after_ms: decision === "wait" ? 2000 : undefined,
    expires_in_s: decision === "wait" ? expiresInS : 0,
    action_type: row.actionType,
    summary: row.summary,
    target: row.target,
    agent_id: row.agentId,
    agent: extra?.agent,
    status: row.status,
  };
}

export function storageFailureStop(): ActionGateResult {
  return {
    decision: "stop",
    reasons: ["Action Gate could not store the decision. The gate fails closed (stop)."],
    must_abort: true,
    approval_id: null,
    poll_url: null,
  };
}

export function missingDatabaseStop(): ActionGateResult {
  return {
    decision: "stop",
    reasons: [ACTION_GATE_DB_ERROR],
    must_abort: true,
    approval_id: null,
    poll_url: null,
    pay_url: ACTION_GATE_PAY_URL,
  };
}

export async function checkActionWith(opts: {
  databaseReady: boolean;
  now: number;
  apiKey: string;
  body: {
    action_type?: unknown;
    summary?: unknown;
    preview?: unknown;
    target?: unknown;
    risk?: unknown;
  };
  agent: { id: string; userId: string; name: string; paused: boolean } | null;
  store: ActionGateStore;
  newId: () => string;
}): Promise<CheckActionOutcome> {
  const key = opts.apiKey.trim();
  if (!key) return { ok: false, status: 401, error: "Missing API key." };
  if (!opts.agent) return { ok: false, status: 401, error: "Unknown API key." };

  if (!opts.databaseReady) {
    return { ok: true, status: 503, result: missingDatabaseStop() };
  }

  const parsed = validateActionBody(opts.body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  if (opts.agent.paused) {
    return {
      ok: true,
      status: 200,
      result: {
        decision: "stop",
        reasons: ["Agent is paused. Do not act."],
        must_abort: true,
        approval_id: null,
        poll_url: null,
        action_type: parsed.actionType,
        agent_id: opts.agent.id,
        agent: opts.agent.name,
      },
    };
  }

  const entitled = await opts.store.entitled(opts.agent.userId, opts.now);
  if (!entitled) {
    return {
      ok: true,
      status: 200,
      result: {
        decision: "stop",
        reasons: [
          `Action Gate is not unlocked. Pay $${ACTION_GATE_PRICE_USD} USDC on Solana: ${ACTION_GATE_PAY_ABSOLUTE}`,
        ],
        must_abort: true,
        approval_id: null,
        poll_url: null,
        pay_url: ACTION_GATE_PAY_URL,
        action_type: parsed.actionType,
        agent_id: opts.agent.id,
        agent: opts.agent.name,
      },
    };
  }

  const id = opts.newId();
  const createdAt = new Date(opts.now).toISOString();
  const expiresAt = new Date(opts.now + HOLD_TTL_MS).toISOString();
  const row: ActionGateRecord = {
    id,
    userId: opts.agent.userId,
    agentId: opts.agent.id,
    actionType: parsed.actionType,
    summary: parsed.summary,
    preview: parsed.preview,
    target: parsed.target,
    risk: parsed.risk,
    status: "hold",
    expiresAt,
    decidedAt: null,
    channel: "request",
    createdAt,
  };
  await opts.store.insert(row);
  await opts.store.audit({
    userId: opts.agent.userId,
    agentId: opts.agent.id,
    action: "action_wait",
    detail: actionAuditDetail({
      verdict: "wait",
      actionType: parsed.actionType,
      target: parsed.target,
      channel: "request",
      who: opts.agent.id,
    }),
  });

  return {
    ok: true,
    status: 200,
    result: resultFromRecord(row, opts.now, {
      agent: opts.agent.name,
      reasons: [
        `${opts.agent.name} is waiting for you: ${parsed.actionType}. No decision in 10 minutes = stop.`,
      ],
    }),
  };
}

export async function pollActionWith(opts: {
  now: number;
  agentId: string;
  approvalId: string;
  store: ActionGateStore;
  agentName?: string;
}): Promise<ActionGateResult | null> {
  const id = opts.approvalId.trim();
  if (!id) return null;
  const row = await opts.store.getById(id);
  if (!row || row.agentId !== opts.agentId) return null;

  if (row.status === "hold" && new Date(row.expiresAt).getTime() <= opts.now) {
    const expired = await opts.store.markExpired(id, new Date(opts.now).toISOString());
    const next = expired ?? { ...row, status: "expired" as const };
    if (expired) {
      await opts.store.audit({
        userId: row.userId,
        agentId: row.agentId,
        action: "action_stop",
        detail: actionAuditDetail({
          verdict: "stop",
          actionType: row.actionType,
          target: row.target,
          channel: "timeout",
          who: "timeout",
        }),
      });
    }
    return resultFromRecord(next, opts.now, { agent: opts.agentName });
  }

  return resultFromRecord(row, opts.now, { agent: opts.agentName });
}

export async function decideActionWith(opts: {
  now: number;
  userId: string;
  approvalId: string;
  decision: "allow" | "block";
  store: ActionGateStore;
}): Promise<{ ok: true; decision: "allow" | "block" } | { ok: false; error: string }> {
  const row = await opts.store.getById(opts.approvalId);
  if (!row || row.userId !== opts.userId) return { ok: false, error: "Request not found." };
  if (row.status !== "hold") return { ok: false, error: "This request was already decided." };
  if (new Date(row.expiresAt).getTime() <= opts.now) {
    const expired = await opts.store.markExpired(row.id, new Date(opts.now).toISOString());
    if (expired) {
      await opts.store.audit({
        userId: row.userId,
        agentId: row.agentId,
        action: "action_stop",
        detail: actionAuditDetail({
          verdict: "stop",
          actionType: row.actionType,
          target: row.target,
          channel: "timeout",
          who: "timeout",
        }),
      });
    }
    return { ok: false, error: "This request expired. The agent must stop." };
  }

  const nowIso = new Date(opts.now).toISOString();
  const next: ActionGateRecord = {
    ...row,
    status: opts.decision === "allow" ? "allow" : "block",
    decidedAt: nowIso,
    channel: "inbox",
  };
  await opts.store.save(next);
  const verdict: ActionDecision = opts.decision === "allow" ? "go" : "stop";
  await opts.store.audit({
    userId: row.userId,
    agentId: row.agentId,
    action: verdict === "go" ? "action_go" : "action_stop",
    detail: actionAuditDetail({
      verdict,
      actionType: row.actionType,
      target: row.target,
      channel: "inbox",
      who: opts.userId,
    }),
  });
  return { ok: true, decision: opts.decision };
}

export const ACTION_GATE_CURL_EMAIL = `curl -s https://agent-control.net/api/v1/check_action \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action_type":"email.send","summary":"Send the refund reply","preview":"Hi — your refund is on the way.","target":"customer@example.com","risk":"high"}'`;

export const ACTION_GATE_CURL_SLACK = `curl -s https://agent-control.net/api/v1/check_action \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action_type":"slack.post","summary":"Post the incident note","preview":"We are investigating the checkout errors.","target":"#support","risk":"medium"}'`;

export const ACTION_GATE_CURL_CRM = `curl -s https://agent-control.net/api/v1/check_action \\
  -H "Authorization: Bearer YOUR_AGENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action_type":"crm.write","summary":"Update the deal stage","preview":"Move Acme to Closed Won.","target":"deal_8841","risk":"high"}'`;

export const ACTION_GATE_MCP_NOTE =
  "Ask: MCP check_action (alias ask_human) takes the same fields. If decision is wait, poll get_approval until go or stop. No decision in 10 minutes = stop. The agent still executes after go. Enforce: MCP email.send, slack.post, and crm.write. Write Gate forwards only on go. Same $49 seat (plan=action). You keep the keys.";

export function actionHoldEmailCopy(opts: {
  agentName: string;
  actionType: string;
  summary: string;
  target?: string | null;
  approvalId: string;
}): {
  subject: string;
  title: string;
  bodyLines: string[];
  ctaPath: string;
  ctaLabel: string;
} {
  const agent = opts.agentName.trim() || "An agent";
  const target = opts.target?.trim();
  return {
    subject: "Agent Control: action waiting",
    title: "An action is waiting for you",
    bodyLines: [
      `${agent} wants to ${opts.actionType} before you decide.`,
      opts.summary,
      ...(target ? [`Target: ${target}`] : []),
      "Allow once or block.",
      ACTION_TIMEOUT_IS_STOP,
    ],
    ctaPath: `/inbox?hold=${encodeURIComponent(opts.approvalId)}`,
    ctaLabel: "Open Approval Inbox",
  };
}
