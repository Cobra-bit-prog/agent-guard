import { getSql } from "@/lib/db";
import { PERIOD_DAYS } from "@/lib/solana-pay";
import { uid } from "@/lib/utils";
import {
  ACTION_GATE_PRICE_USD,
  actionGateDatabaseReady,
  actionHoldEmailCopy,
  checkActionWith,
  decideActionWith,
  missingDatabaseStop,
  pollActionWith,
  storageFailureStop,
  type ActionGateRecord,
  type ActionGateStore,
  type CheckActionOutcome,
} from "@/lib/action-gate";
import { notifyInboxHold } from "@/lib/server/notify";

function mapRow(r: Record<string, unknown>): ActionGateRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    agentId: String(r.agent_id),
    actionType: String(r.action_type),
    summary: String(r.summary),
    preview: String(r.preview),
    target: r.target ? String(r.target) : null,
    risk: r.risk ? String(r.risk) : null,
    status: String(r.status) as ActionGateRecord["status"],
    expiresAt: String(r.expires_at),
    decidedAt: r.decided_at ? String(r.decided_at) : null,
    channel: r.channel ? String(r.channel) : null,
    createdAt: String(r.created_at),
  };
}

async function sqlStore(): Promise<ActionGateStore> {
  const sql = await getSql();
  const store: ActionGateStore = {
    async entitled(userId, now) {
      const rows = await sql<{ paid_until: string }>`
        select paid_until from action_entitlements where user_id = ${userId}
      `;
      const until = rows[0]?.paid_until;
      if (!until) return false;
      return new Date(until).getTime() > now;
    },
    async insert(row) {
      await sql`
        insert into action_approvals (
          id, user_id, agent_id, action_type, summary, preview, target, risk,
          status, expires_at, decided_at, channel, created_at
        ) values (
          ${row.id}, ${row.userId}, ${row.agentId}, ${row.actionType}, ${row.summary},
          ${row.preview}, ${row.target}, ${row.risk}, ${row.status}, ${row.expiresAt},
          ${row.decidedAt}, ${row.channel}, ${row.createdAt}
        )
      `;
    },
    async getById(id) {
      const rows = await sql`select * from action_approvals where id = ${id}`;
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async listOpen(userId, now) {
      const due = await sql<{ id: string; agent_id: string }>`
        select id, agent_id from action_approvals
        where user_id = ${userId} and status = ${"hold"} and expires_at <= ${new Date(now).toISOString()}
      `;
      for (const raw of due) {
        await pollActionWith({
          now,
          agentId: String(raw.agent_id),
          approvalId: String(raw.id),
          store,
        });
      }
      const rows = await sql`
        select * from action_approvals
        where user_id = ${userId} and status = ${"hold"}
        order by created_at desc
      `;
      return rows.map(mapRow);
    },
    async save(row) {
      await sql`
        update action_approvals
        set status = ${row.status},
            decided_at = ${row.decidedAt},
            channel = ${row.channel}
        where id = ${row.id} and user_id = ${row.userId}
      `;
    },
    async markExpired(id, nowIso) {
      const rows = await sql`
        update action_approvals
        set status = ${"expired"}, decided_at = ${nowIso}, channel = ${"timeout"}
        where id = ${id} and status = ${"hold"} and expires_at <= ${nowIso}
        returning *
      `;
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async audit(event) {
      await sql`
        insert into audit_events (id, user_id, agent_id, action, detail)
        values (
          ${uid()}, ${event.userId}, ${event.agentId}, ${event.action}, ${event.detail}
        )
      `;
    },
  };
  return store;
}

type AgentHit = { id: string; userId: string; name: string; paused: boolean };

async function agentForKey(apiKey: string): Promise<AgentHit | null> {
  const key = apiKey.trim();
  if (!key) return null;
  const sql = await getSql();
  const agents = await sql`
    select id, user_id, name, is_paused from agents where api_key = ${key}
  `;
  const agent = agents[0];
  if (!agent) return null;
  return {
    id: String(agent.id),
    userId: String(agent.user_id),
    name: String(agent.name),
    paused: Boolean(agent.is_paused),
  };
}

export async function checkActionIntent(input: {
  apiKey: string;
  body: {
    action_type?: unknown;
    summary?: unknown;
    preview?: unknown;
    target?: unknown;
    risk?: unknown;
  };
  now?: number;
}): Promise<CheckActionOutcome> {
  const now = input.now ?? Date.now();
  if (!actionGateDatabaseReady()) {
    const key = input.apiKey.trim();
    if (!key) return { ok: false, status: 401, error: "Missing API key." };
    return { ok: true, status: 503, result: missingDatabaseStop() };
  }

  let agent: AgentHit | null;
  let store: ActionGateStore;
  let outcome: CheckActionOutcome;
  try {
    agent = await agentForKey(input.apiKey);
    store = await sqlStore();
    outcome = await checkActionWith({
      databaseReady: true,
      now,
      apiKey: input.apiKey,
      body: input.body,
      agent,
      store,
      newId: uid,
    });
  } catch (err) {
    console.error("[action-gate] storage unavailable", err instanceof Error ? err.name : "error");
    return { ok: true, status: 503, result: storageFailureStop() };
  }
  if (outcome.ok && outcome.result.decision === "wait" && outcome.result.approval_id && agent) {
    try {
      const held = await store.getById(outcome.result.approval_id);
      if (held) {
        const copy = actionHoldEmailCopy({
          agentName: agent.name,
          actionType: held.actionType,
          summary: held.summary,
          target: held.target,
          approvalId: held.id,
        });
        await notifyInboxHold({
          userId: agent.userId,
          agentId: agent.id,
          agentName: agent.name,
          approvalId: held.id,
          message: `${agent.name} is waiting on ${held.actionType}: ${held.summary}`,
          emailCopy: copy,
        });
      }
    } catch (err) {
      console.error("[action-gate] notify failed", err instanceof Error ? err.name : "error");
    }
  }
  return outcome;
}

export async function pollActionIntent(input: {
  apiKey: string;
  approvalId: string;
  now?: number;
}): Promise<CheckActionOutcome> {
  if (!input.apiKey.trim()) return { ok: false, status: 401, error: "Missing API key." };
  if (!actionGateDatabaseReady()) {
    return { ok: false, status: 404, error: "Unknown approval." };
  }
  try {
    const agent = await agentForKey(input.apiKey);
    if (!agent) return { ok: false, status: 401, error: "Unknown API key." };
    const store = await sqlStore();
    const result = await pollActionWith({
      now: input.now ?? Date.now(),
      agentId: agent.id,
      approvalId: input.approvalId,
      store,
      agentName: agent.name,
    });
    if (!result) return { ok: false, status: 404, error: "Unknown approval." };
    return { ok: true, status: 200, result };
  } catch (err) {
    console.error("[action-gate] poll storage unavailable", err instanceof Error ? err.name : "error");
    return { ok: true, status: 503, result: storageFailureStop() };
  }
}

export async function decideActionForUser(input: {
  userId: string;
  approvalId: string;
  decision: "allow" | "block";
  now?: number;
}): Promise<{ ok: true; decision: "allow" | "block" } | { ok: false; error: string }> {
  if (!actionGateDatabaseReady()) {
    return { ok: false, error: "Action Gate requires DATABASE_URL before a decision can be stored." };
  }
  const store = await sqlStore();
  return decideActionWith({
    now: input.now ?? Date.now(),
    userId: input.userId,
    approvalId: input.approvalId,
    decision: input.decision,
    store,
  });
}

export type InboxActionItem = ActionGateRecord & { agent_name?: string; kind: "action" };

export async function findActionHoldForUser(userId: string, approvalId: string): Promise<ActionGateRecord | null> {
  if (!actionGateDatabaseReady()) return null;
  try {
    const store = await sqlStore();
    const row = await store.getById(approvalId);
    if (!row || row.userId !== userId) return null;
    return row;
  } catch (err) {
    console.error("[action-gate] lookup failed", err instanceof Error ? err.name : "error");
    return null;
  }
}

export async function listOpenActionHolds(userId: string, now = Date.now()): Promise<InboxActionItem[]> {
  if (!actionGateDatabaseReady()) return [];
  const store = await sqlStore();
  const rows = await store.listOpen(userId, now);
  const sql = await getSql();
  const names = await sql<{ id: string; name: string }>`
    select id, name from agents where user_id = ${userId}
  `;
  const byId = new Map(names.map((row) => [String(row.id), String(row.name)]));
  return rows.map((row) => ({
    ...row,
    kind: "action" as const,
    agent_name: byId.get(row.agentId),
  }));
}

/** Unlock Action Gate for 30 days. Does not replace a Human Starter/Pro/Team plan. */
export async function applyActionEntitlement(userId: string): Promise<void> {
  if (!userId || userId.startsWith("guest:")) return;
  const sql = await getSql();
  const until = new Date(Date.now() + PERIOD_DAYS * 86400000).toISOString();
  const now = new Date().toISOString();
  await sql`
    insert into action_entitlements (user_id, paid_until, updated_at)
    values (${userId}, ${until}, ${now})
    on conflict (user_id) do update
      set paid_until = ${until},
          updated_at = ${now}
  `;
  await sql`
    insert into audit_events (id, user_id, agent_id, action, detail)
    values (
      ${uid()}, ${userId}, ${null}, ${"action_gate_paid"},
      ${`Action Gate paid. Unlocked until ${until}. Plan action $${ACTION_GATE_PRICE_USD}.`}
    )
  `;
}
