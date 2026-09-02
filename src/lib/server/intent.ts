import { getSql } from "@/lib/db";
import { pollDecisionFromStatus, shouldHoldFirstTimeDestination } from "@/lib/hold";
import { evaluateEntitlement } from "@/lib/plans";
import { evaluateTransfer, isNearDailyLimit, nearLimitMessage } from "@/lib/policy";
import { ensureSchema } from "@/lib/server/guard";
import { getApprovalForAgent, insertHold } from "@/lib/server/approvals";
import {
  notifyWarningAlert,
  shouldInsertNearLimitAlert,
  warningKindForDecision,
} from "@/lib/server/notify";
import { uid } from "@/lib/utils";
import type { ChainId } from "@/lib/chains";

function num(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}

export type IntentResult = {
  decision: "allow" | "alert" | "block" | "hold";
  reasons: string[];
  check_id: string;
  agent_id: string;
  agent: string;
  must_abort: boolean;
  paused: boolean;
  approval_id?: string | null;
  poll_url?: string | null;
  poll_after_ms?: number;
  expires_in_s?: number;
};

export async function checkTransferIntent(input: {
  apiKey: string;
  to: string;
  valueUsd: number;
  native?: string;
}): Promise<{ ok: true; result: IntentResult } | { ok: false; status: number; error: string }> {
  const key = input.apiKey.trim();
  if (!key) return { ok: false, status: 401, error: "Missing API key." };
  await ensureSchema();
  const sql = await getSql();
  const agents = await sql`
    select * from agents where api_key = ${key}
  `;
  const agent = agents[0];
  if (!agent) return { ok: false, status: 401, error: "Unknown API key." };

  const sub = await sql<{
    plan: string;
    status: string;
    trial_ends_at: string | null;
    period_ends_at: string | null;
  }>`
    select plan, status, trial_ends_at, period_ends_at from subscriptions where user_id = ${String(agent.user_id)}
  `;
  const ent = evaluateEntitlement(sub[0] ?? { plan: "free", trial_ends_at: null });
  if (ent.expired) {
    const reason =
      ent.plan === "free"
        ? "Your 1-day free trial has ended. Pay in USDC to resume checks."
        : "Your plan has ended. Pay in USDC to resume checks.";
    return {
      ok: true,
      result: {
        decision: "block",
        reasons: [reason],
        check_id: uid(),
        agent_id: String(agent.id),
        agent: String(agent.name),
        must_abort: true,
        paused: true,
      },
    };
  }
  const paused = Boolean(agent.is_paused);

  const policies = await sql`select * from policies where agent_id = ${String(agent.id)}`;
  const p = policies[0];
  if (!p) return { ok: false, status: 400, error: "Agent has no policy." };

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const hour = new Date(Date.now() - 3600 * 1000).toISOString();
  const volRows = await sql<{ vol: string }>`
    select coalesce(sum(value_usd),0)::text as vol from transactions
    where agent_id = ${String(agent.id)} and timestamp >= ${since}
  `;
  const hourRows = await sql<{ c: number }>`
    select count(*)::int as c from transactions
    where agent_id = ${String(agent.id)} and timestamp >= ${hour}
  `;

  const usedTodayUsd = num(volRows[0]?.vol);
  const dailyLimitUsd = num(p.daily_limit_usd);
  const verdict = evaluateTransfer({
    valueUsd: input.valueUsd,
    to: input.to,
    usedTodayUsd,
    txsLastHour: num(hourRows[0]?.c),
    paused,
    policy: {
      daily_limit_usd: dailyLimitUsd,
      max_tx_amount_usd: num(p.max_tx_amount_usd),
      alert_threshold_usd: num(p.alert_threshold_usd),
      allowlist: asStrings(p.allowlist),
      denylist: asStrings(p.denylist),
      max_hourly_txs: Math.max(1, num(p.max_hourly_txs) || 20),
    },
  });

  let action = verdict.action;
  const reasons = [...verdict.reasons];
  if (action === "allow" || action === "alert") {
    const known = await sql<{ to_address: string }>`
      select distinct to_address from transactions
      where agent_id = ${String(agent.id)}
        and status = ${"success"}
        and source <> ${"presign"}
    `;
    if (
      shouldHoldFirstTimeDestination({
        action,
        dest: input.to,
        allowlist: asStrings(p.allowlist),
        seenSuccessDestinations: known.map((r) => r.to_address),
      })
    ) {
      action = "hold";
      reasons.unshift("First-time destination — waiting for you.");
    }
  }

  const checkId = uid();
  const blocked = action === "block";
  const held = action === "hold";
  await sql`
    insert into transactions (
      id, agent_id, user_id, chain, tx_hash, from_address, to_address,
      value_usd, value_native, kind, is_violation, status, timestamp, source
    ) values (
      ${checkId}, ${String(agent.id)}, ${String(agent.user_id)}, ${String(agent.chain) as ChainId},
      ${`presign:${checkId}`}, ${String(agent.address)}, ${input.to},
      ${input.valueUsd}, ${input.native ?? "0"}, ${"Pre-sign check"}, ${blocked || held},
      ${blocked ? "blocked" : held ? "held" : "success"}, ${new Date().toISOString()}, ${"presign"}
    )
  `;
  await sql`
    insert into audit_events (id, user_id, agent_id, action, detail)
    values (
      ${uid()}, ${String(agent.user_id)}, ${String(agent.id)},
      ${blocked ? "presign_block" : held ? "presign_hold" : "presign_check"},
      ${`${action.toUpperCase()} $${input.valueUsd.toFixed(0)} → ${input.to.slice(0, 18)}`}
    )
  `;

  let approvalId: string | null = null;
  let expiresInS: number | undefined;
  const nearLimit = isNearDailyLimit({
    usedTodayUsd,
    valueUsd: input.valueUsd,
    dailyLimitUsd,
  });
  const nearMessage = nearLimit
    ? nearLimitMessage({
        agentName: String(agent.name),
        usedTodayUsd,
        valueUsd: input.valueUsd,
        dailyLimitUsd,
      })
    : "";

  if (held) {
    const hold = await insertHold({
      userId: String(agent.user_id),
      agentId: String(agent.id),
      txId: checkId,
      to: input.to,
      valueUsd: input.valueUsd,
      native: input.native,
      reasons,
    });
    approvalId = hold.id;
    expiresInS = hold.expiresInS;
    await sql`
      insert into alerts (id, agent_id, user_id, type, severity, message)
      values (
        ${uid()}, ${String(agent.id)}, ${String(agent.user_id)},
        ${"approval_hold"}, ${"warning"},
        ${`${String(agent.name)} is waiting for you: $${input.valueUsd.toFixed(0)} → ${input.to.slice(0, 18)}`}
      )
    `;
  }

  if (blocked) {
    await sql`
      insert into alerts (id, agent_id, user_id, type, severity, message)
      values (
        ${uid()}, ${String(agent.id)}, ${String(agent.user_id)},
        ${"presign_block"}, ${"critical"},
        ${`${String(agent.name)} blocked a pre-sign check: ${reasons[0]}`}
      )
    `;
    await sql`update agents set status = ${"critical"} where id = ${String(agent.id)}`;
  } else if (action === "alert") {
    await sql`
      insert into alerts (id, agent_id, user_id, type, severity, message)
      values (
        ${uid()}, ${String(agent.id)}, ${String(agent.user_id)},
        ${"presign_alert"}, ${"warning"},
        ${`${String(agent.name)} crossed an alert threshold: ${reasons[0]}`}
      )
    `;
  } else if (shouldInsertNearLimitAlert(action, nearLimit)) {
    await sql`
      insert into alerts (id, agent_id, user_id, type, severity, message)
      values (
        ${uid()}, ${String(agent.id)}, ${String(agent.user_id)},
        ${"near_limit"}, ${"warning"},
        ${nearMessage}
      )
    `;
  }

  const kind = warningKindForDecision(action, nearLimit);
  if (kind) {
    const message =
      kind === "hold"
        ? `${String(agent.name)} is waiting for you: $${input.valueUsd.toFixed(0)} → ${input.to.slice(0, 18)}`
        : kind === "block"
          ? `${String(agent.name)} blocked a pre-sign check: ${reasons[0]}`
          : kind === "alert"
            ? `${String(agent.name)} crossed an alert threshold: ${reasons[0]}`
            : nearMessage;
    await notifyWarningAlert({
      userId: String(agent.user_id),
      agentId: String(agent.id),
      agentName: String(agent.name),
      kind,
      message,
    });
  }

  return {
    ok: true,
    result: {
      decision: action,
      reasons,
      check_id: checkId,
      agent_id: String(agent.id),
      agent: String(agent.name),
      must_abort: blocked || held,
      paused,
      approval_id: approvalId,
      poll_url: approvalId ? `/api/v1/approvals/${approvalId}` : null,
      poll_after_ms: approvalId ? 2000 : undefined,
      expires_in_s: expiresInS,
    },
  };
}

export async function pollApprovalIntent(input: { apiKey: string; approvalId: string }) {
  const key = input.apiKey.trim();
  if (!key) return { ok: false as const, status: 401, error: "Missing API key." };
  await ensureSchema();
  const sql = await getSql();
  const agents = await sql`select * from agents where api_key = ${key}`;
  const agent = agents[0];
  if (!agent) return { ok: false as const, status: 401, error: "Unknown API key." };

  const row = await getApprovalForAgent({
    approvalId: input.approvalId,
    agentId: String(agent.id),
  });
  if (!row) return { ok: false as const, status: 404, error: "Unknown approval." };

  const decision = pollDecisionFromStatus(row.status);
  const mustAbort = decision !== "allow";
  const expiresInS = Math.max(
    0,
    Math.round((new Date(row.expires_at).getTime() - Date.now()) / 1000),
  );

  return {
    ok: true as const,
    result: {
      decision,
      must_abort: mustAbort,
      approval_id: row.id,
      poll_url: `/api/v1/approvals/${row.id}`,
      poll_after_ms: decision === "hold" ? 2000 : undefined,
      expires_in_s: decision === "hold" ? expiresInS : 0,
      reasons: row.reasons,
      agent: String(agent.name),
      value_usd: row.value_usd,
      to: row.to_address,
      status: row.status,
    },
  };
}

export async function agentStatusForKey(apiKey: string) {
  const sql = await getSql();
  const agents = await sql`select * from agents where api_key = ${apiKey.trim()}`;
  const agent = agents[0];
  if (!agent) return null;
  const sub = await sql<{
    plan: string;
    status: string;
    trial_ends_at: string | null;
    period_ends_at: string | null;
  }>`
    select plan, status, trial_ends_at, period_ends_at from subscriptions where user_id = ${String(agent.user_id)}
  `;
  const ent = evaluateEntitlement(sub[0] ?? { plan: "free", trial_ends_at: null });
  return {
    agent_id: String(agent.id),
    name: String(agent.name),
    chain: String(agent.chain),
    address: String(agent.address),
    paused: Boolean(agent.is_paused) || ent.expired,
    status: String(agent.status),
    expired: ent.expired,
    is_demo: Boolean(agent.is_demo),
  };
}
