import { getSql } from "@/lib/db";
import { evaluateEntitlement } from "@/lib/plans";
import { evaluateTransfer } from "@/lib/policy";
import { ensureSchema } from "@/lib/server/guard";
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
  decision: "allow" | "alert" | "block";
  reasons: string[];
  check_id: string;
  agent_id: string;
  agent: string;
  must_abort: boolean;
  paused: boolean;
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

  const verdict = evaluateTransfer({
    valueUsd: input.valueUsd,
    to: input.to,
    usedTodayUsd: num(volRows[0]?.vol),
    txsLastHour: num(hourRows[0]?.c),
    paused,
    policy: {
      daily_limit_usd: num(p.daily_limit_usd),
      max_tx_amount_usd: num(p.max_tx_amount_usd),
      alert_threshold_usd: num(p.alert_threshold_usd),
      allowlist: asStrings(p.allowlist),
      denylist: asStrings(p.denylist),
      max_hourly_txs: Math.max(1, num(p.max_hourly_txs) || 20),
    },
  });

  const checkId = uid();
  const blocked = verdict.action === "block";
  await sql`
    insert into transactions (
      id, agent_id, user_id, chain, tx_hash, from_address, to_address,
      value_usd, value_native, kind, is_violation, status, timestamp, source
    ) values (
      ${checkId}, ${String(agent.id)}, ${String(agent.user_id)}, ${String(agent.chain) as ChainId},
      ${`presign:${checkId}`}, ${String(agent.address)}, ${input.to},
      ${input.valueUsd}, ${input.native ?? "0"}, ${"Pre-sign check"}, ${blocked},
      ${blocked ? "blocked" : "success"}, ${new Date().toISOString()}, ${"presign"}
    )
  `;
  await sql`
    insert into audit_events (id, user_id, agent_id, action, detail)
    values (
      ${uid()}, ${String(agent.user_id)}, ${String(agent.id)},
      ${blocked ? "presign_block" : "presign_check"},
      ${`${verdict.action.toUpperCase()} $${input.valueUsd.toFixed(0)} → ${input.to.slice(0, 18)}`}
    )
  `;
  if (blocked) {
    await sql`
      insert into alerts (id, agent_id, user_id, type, severity, message)
      values (
        ${uid()}, ${String(agent.id)}, ${String(agent.user_id)},
        ${"presign_block"}, ${"critical"},
        ${`${String(agent.name)} blocked a pre-sign check: ${verdict.reasons[0]}`}
      )
    `;
    await sql`update agents set status = ${"critical"} where id = ${String(agent.id)}`;
  }

  return {
    ok: true,
    result: {
      decision: verdict.action,
      reasons: verdict.reasons,
      check_id: checkId,
      agent_id: String(agent.id),
      agent: String(agent.name),
      must_abort: blocked,
      paused,
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
