import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { sendNewSubscriberNotifyEmail } from "@/lib/auth/send-email.server";
import { getSql } from "@/lib/db";
import { CHAINS, validateAddress, type ChainId } from "@/lib/chains";
import { FREE_TRIAL_DAYS, PLANS, evaluateEntitlement, type Entitlement } from "@/lib/plans";
import { evaluateTransfer, protectionScore } from "@/lib/policy";
import { readNativeBalance, readRecentTransfers, USD_PRICE } from "@/lib/onchain";
import { uid } from "@/lib/utils";
import {
  countOpenHolds,
  ensureApprovalsTable,
  insertHold,
  listOpenHolds,
} from "@/lib/server/approvals";
import { ensureAuditReportsTable } from "@/lib/server/audit-reports";

function num(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export type AgentRow = {
  id: string;
  name: string;
  address: string;
  chain: ChainId;
  role: string;
  status: "healthy" | "warning" | "critical";
  is_paused: boolean;
  is_demo: boolean;
  api_key: string;
  last_synced_at: string | null;
  balance_usd: number;
  created_at: string;
};

export type PolicyRow = {
  id: string;
  agent_id: string;
  daily_limit_usd: number;
  max_tx_amount_usd: number;
  alert_threshold_usd: number;
  allowlist: string[];
  denylist: string[];
  max_hourly_txs: number;
};

export type TxRow = {
  id: string;
  agent_id: string;
  chain: ChainId;
  tx_hash: string;
  from_address: string;
  to_address: string;
  value_usd: number;
  value_native: string;
  kind: string;
  is_violation: boolean;
  status: string;
  source: string;
  timestamp: string;
};

export type AlertRow = {
  id: string;
  agent_id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  acknowledged: boolean;
  created_at: string;
  agent_name?: string;
};

export type AuditRow = {
  id: string;
  agent_id: string | null;
  action: string;
  detail: string;
  created_at: string;
};

const DEMO_AGENTS: Array<{
  name: string;
  role: string;
  chain: ChainId;
  address: string;
  status: AgentRow["status"];
  daily: number;
}> = [
  {
    name: "Trade Agent Alpha",
    role: "Trading Agent",
    chain: "base",
    address: "0x7a3b91c92d4e11a8b0f6e4c8a1d2b3c4d5e6f701",
    status: "healthy",
    daily: 30000,
  },
  {
    name: "Research Agent Beta",
    role: "Analytics Agent",
    chain: "ethereum",
    address: "0x8f1e7b3a9c4d2e11a8b0f6e4c8a1d2b3c4d5e6f702",
    status: "warning",
    daily: 12000,
  },
  {
    name: "Execution Agent Gamma",
    role: "Execution Agent",
    chain: "base",
    address: "0x3c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c03",
    status: "critical",
    daily: 25000,
  },
  {
    name: "Risk Agent Delta",
    role: "Risk Management",
    chain: "solana",
    address: "H3xK9mPq2RsT8uVwYzAbCdEfGhJkMnNpQrStUvWxYa",
    status: "healthy",
    daily: 8000,
  },
  {
    name: "Oracle Agent Epsilon",
    role: "Data Oracle Agent",
    chain: "solana",
    address: "7bTe1Fa9gHj2kLmNoPqRstuVwXyZaBcDeFgHjkMnNp",
    status: "warning",
    daily: 6000,
  },
];

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fakeHash(seed: string, chain: ChainId) {
  const h = hashStr(seed).toString(16).padStart(8, "0");
  if (chain === "solana") {
    return `${h}${hashStr(seed + "x").toString(16)}${hashStr(seed + "y").toString(16)}`.slice(
      0,
      44,
    );
  }
  return `0x${h}${hashStr(seed + "a")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "b")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "c")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "d")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "e")
    .toString(16)
    .padStart(4, "0")}`;
}

function fakeAddr(seed: string, chain: ChainId) {
  if (chain === "solana") {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = hashStr(seed);
    let out = "";
    for (let i = 0; i < 44; i++) {
      n = Math.imul(n ^ i, 2654435761) >>> 0;
      out += alphabet[n % alphabet.length];
    }
    return out;
  }
  return `0x${hashStr(seed).toString(16).padStart(8, "0")}${hashStr(seed + "z")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "q")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "w")
    .toString(16)
    .padStart(8, "0")}${hashStr(seed + "e")
    .toString(16)
    .padStart(8, "0")}`;
}

const KINDS = [
  "Swap Executed",
  "Policy Limit Approaching",
  "Large Transfer Detected",
  "Oracle Update",
  "Spend Limit Reset",
  "Transfer",
];

function demoSampleUsd(seed: string) {
  return 2400 + (hashStr(seed) % 12600);
}

function demoNative(chain: ChainId, usd: number) {
  if (chain === "solana") return (usd / USD_PRICE.SOL).toFixed(4);
  return (usd / USD_PRICE.ETH).toFixed(5);
}

async function seedDemoHistory(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  agent: { id: string; name: string; address: string; chain: ChainId; status: AgentRow["status"] },
  salt: string,
) {
  const now = Date.now();
  const count = 10 + (hashStr(agent.name + salt) % 8);
  for (let i = 0; i < count; i++) {
    const ts = new Date(now - i * 47 * 60 * 1000 - (hashStr(agent.name + i + salt) % 20) * 60000);
    const value = 40 + (hashStr(agent.address + i + salt) % 1800);
    const kind = KINDS[hashStr(agent.name + String(i) + salt) % KINDS.length];
    const isV = agent.status === "critical" && i < 2 ? true : agent.status === "warning" && i === 0;
    const txStatus =
      isV && kind.includes("Failed")
        ? "failed"
        : i === 3 && agent.status === "critical"
          ? "failed"
          : "success";
    await sql`
      insert into transactions (
        id, agent_id, user_id, chain, tx_hash, from_address, to_address,
        value_usd, value_native, kind, is_violation, status, timestamp, source
      ) values (
        ${uid()}, ${agent.id}, ${userId}, ${agent.chain}, ${fakeHash(agent.address + i + salt, agent.chain)},
        ${agent.address}, ${fakeAddr(agent.address + "to" + i + salt, agent.chain)},
        ${value}, ${String((value / 3200).toFixed(4))}, ${kind}, ${isV}, ${txStatus}, ${ts.toISOString()}, ${"demo"}
      )
      on conflict do nothing
    `;
  }
}

async function hydrateDemoAgents(userId: string) {
  const sql = await getSql();
  const agents = (await sql`select * from agents where user_id = ${userId} and is_demo = true`).map(
    mapAgent,
  );
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  for (const agent of agents) {
    if (agent.balance_usd <= 0) {
      const usd = demoSampleUsd(agent.address);
      await sql`
        update agents
        set balance_usd = ${usd}, last_synced_at = ${new Date().toISOString()}
        where id = ${agent.id} and user_id = ${userId}
      `;
    }
    const txCount = await sql<{ c: number }>`
      select count(*)::int as c from transactions
      where agent_id = ${agent.id} and timestamp >= ${since}
    `;
    if (num(txCount[0]?.c) === 0) {
      await seedDemoHistory(sql, userId, agent, "hydrate");
    }
    const pol = await sql<{
      id: string;
    }>`select id from policies where agent_id = ${agent.id} limit 1`;
    if (!pol[0]) {
      const daily = 12000;
      const allow = JSON.stringify([
        fakeAddr(agent.address + "ok1", agent.chain),
        fakeAddr(agent.address + "ok2", agent.chain),
      ]);
      await sql`
        insert into policies (
          id, agent_id, user_id, daily_limit_usd, max_tx_amount_usd, alert_threshold_usd,
          allowlist, denylist, max_hourly_txs
        )
        values (
          ${uid()}, ${agent.id}, ${userId}, ${daily}, ${daily * 0.2}, ${daily * 0.15},
          ${allow}::jsonb, ${"[]"}::jsonb, ${12}
        )
      `;
    }
  }
}

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapPolicy(p: Record<string, unknown>): PolicyRow {
  return {
    id: String(p.id),
    agent_id: String(p.agent_id),
    daily_limit_usd: num(p.daily_limit_usd),
    max_tx_amount_usd: num(p.max_tx_amount_usd),
    alert_threshold_usd: num(p.alert_threshold_usd),
    allowlist: asStrings(p.allowlist),
    denylist: asStrings(p.denylist),
    max_hourly_txs: Math.max(1, num(p.max_hourly_txs) || 20),
  };
}

function generateApiKey() {
  return `ag_${uid().replaceAll("-", "")}`;
}

function mapTx(t: Record<string, unknown>): TxRow {
  return {
    id: String(t.id),
    agent_id: String(t.agent_id),
    chain: t.chain as ChainId,
    tx_hash: String(t.tx_hash),
    from_address: String(t.from_address),
    to_address: String(t.to_address),
    value_usd: num(t.value_usd),
    value_native: String(t.value_native),
    kind: String(t.kind),
    is_violation: Boolean(t.is_violation),
    status: String(t.status),
    source: String(t.source ?? "demo"),
    timestamp: String(t.timestamp),
  };
}

function mapAgent(r: Record<string, unknown>): AgentRow {
  return {
    id: String(r.id),
    name: String(r.name),
    address: String(r.address),
    chain: r.chain as ChainId,
    role: String(r.role),
    status: r.status as AgentRow["status"],
    is_paused: Boolean(r.is_paused),
    is_demo: Boolean(r.is_demo),
    api_key: String(r.api_key ?? ""),
    last_synced_at: r.last_synced_at ? String(r.last_synced_at) : null,
    balance_usd: num(r.balance_usd),
    created_at: String(r.created_at),
  };
}

async function logAudit(userId: string, action: string, detail: string, agentId?: string | null) {
  const sql = await getSql();
  await sql`
    insert into audit_events (id, user_id, agent_id, action, detail)
    values (${uid()}, ${userId}, ${agentId ?? null}, ${action}, ${detail})
  `;
}

async function queueNotice(userId: string, channel: string, message: string) {
  const sql = await getSql();
  await sql`
    insert into notification_log (id, user_id, channel, message)
    values (${uid()}, ${userId}, ${channel}, ${message})
  `;
}

export async function ensureSchema() {
  const sql = await getSql();
  await sql.query(
    `alter table policies add column if not exists denylist jsonb not null default '[]'`,
  );
  await sql.query(
    `alter table policies add column if not exists max_hourly_txs integer not null default 20`,
  );
  await sql.query(`alter table profiles add column if not exists webhook_url text`);
  await sql.query(`
    create table if not exists audit_events (
      id text primary key,
      user_id text not null,
      agent_id text,
      action text not null,
      detail text not null,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(
    `create index if not exists audit_events_user_idx on audit_events (user_id, created_at desc)`,
  );
  await sql.query(`
    create table if not exists notification_log (
      id text primary key,
      user_id text not null,
      channel text not null,
      message text not null,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(
    `create index if not exists notification_log_user_idx on notification_log (user_id, created_at desc)`,
  );
  await ensureApprovalsTable();
  await ensureAuditReportsTable();
  await sql.query(
    `alter table agents add column if not exists is_demo boolean not null default false`,
  );
  await sql.query(`alter table agents add column if not exists api_key text`);
  await sql.query(`alter table agents add column if not exists last_synced_at timestamptz`);
  await sql.query(
    `alter table agents add column if not exists balance_usd numeric not null default 0`,
  );
  await sql.query(
    `alter table transactions add column if not exists source text not null default 'demo'`,
  );
  await sql.query(
    `create unique index if not exists transactions_agent_hash_idx on transactions (agent_id, tx_hash)`,
  );
  await sql.query(`alter table subscriptions add column if not exists period_ends_at timestamptz`);
  await sql.query(`
    create table if not exists pay_requests (
      id text primary key,
      user_id text not null,
      plan text not null,
      chain text not null default 'solana',
      amount_usdc integer not null,
      amount_base_units text not null,
      reference text not null unique,
      recipient text not null,
      status text not null default 'pending',
      signature text,
      paid_amount_usdc numeric,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      paid_at timestamptz,
      invoice_email_sent_at timestamptz
    )
  `);
  await sql.query(
    `create index if not exists pay_requests_user_idx on pay_requests (user_id, created_at desc)`,
  );
  await sql.query(
    `create index if not exists pay_requests_reference_idx on pay_requests (reference)`,
  );
  await sql.query(
    `alter table pay_requests add column if not exists chain text not null default 'solana'`,
  );
  await sql.query(
    `alter table pay_requests add column if not exists asset text not null default 'usdc'`,
  );
  await sql.query(
    `alter table pay_requests add column if not exists invoice_email_sent_at timestamptz`,
  );
  const demoAddrs = DEMO_AGENTS.map((d) => d.address);
  for (const addr of demoAddrs) {
    await sql`update agents set is_demo = true where address = ${addr} and is_demo = false`;
  }
  const missingKeys = await sql<{
    id: string;
  }>`select id from agents where api_key is null or api_key = ${""}`;
  for (const row of missingKeys) {
    await sql`update agents set api_key = ${generateApiKey()} where id = ${row.id}`;
  }
}

async function ensureWorkspace(userId: string) {
  await ensureSchema();
  const sql = await getSql();
  await sql`
    insert into profiles (user_id) values (${userId})
    on conflict (user_id) do nothing
  `;
  const trial = new Date(Date.now() + FREE_TRIAL_DAYS * 86400000).toISOString();
  const inserted = await sql<{ user_id: string }>`
    insert into subscriptions (user_id, plan, status, trial_ends_at)
    values (${userId}, ${"free"}, ${"trialing"}, ${trial})
    on conflict (user_id) do nothing
    returning user_id
  `;
  if (inserted.length > 0) {
    let userEmail: string | undefined;
    try {
      const users = await sql<{ email: string }>`
        select email from "user" where id = ${userId} limit 1
      `;
      const email = users[0]?.email?.trim();
      if (email) userEmail = email;
    } catch (err) {
      console.error("[notify] user email lookup failed", err);
    }
    await sendNewSubscriberNotifyEmail({
      kind: "trial",
      planName: PLANS.free.name,
      at: new Date().toISOString(),
      userEmail,
    });
  }
  const existing = await sql<{
    c: number;
  }>`select count(*)::int as c from agents where user_id = ${userId}`;
  if (num(existing[0]?.c) === 0) {
    for (const demo of DEMO_AGENTS.slice(0, 2)) {
      const id = uid();
      const sampleUsd = demoSampleUsd(demo.address);
      await sql`
      insert into agents (id, user_id, name, address, chain, role, status, is_demo, api_key, balance_usd)
      values (${id}, ${userId}, ${demo.name}, ${demo.address}, ${demo.chain}, ${demo.role}, ${demo.status}, ${true}, ${generateApiKey()}, ${sampleUsd})
    `;
      const allow = JSON.stringify([
        fakeAddr(demo.address + "ok1", demo.chain),
        fakeAddr(demo.address + "ok2", demo.chain),
      ]);
      await sql`
      insert into policies (
        id, agent_id, user_id, daily_limit_usd, max_tx_amount_usd, alert_threshold_usd,
        allowlist, denylist, max_hourly_txs
      )
      values (
        ${uid()}, ${id}, ${userId}, ${demo.daily}, ${demo.daily * 0.2}, ${demo.daily * 0.15},
        ${allow}::jsonb, ${"[]"}::jsonb, ${12}
      )
    `;
      await seedDemoHistory(
        sql,
        userId,
        { id, name: demo.name, address: demo.address, chain: demo.chain, status: demo.status },
        "seed",
      );
      if (demo.status !== "healthy") {
        await sql`
        insert into alerts (id, agent_id, user_id, type, severity, message)
        values (
          ${uid()}, ${id}, ${userId},
          ${demo.status === "critical" ? "large_transfer" : "limit_approaching"},
          ${demo.status === "critical" ? "critical" : "warning"},
          ${
            demo.status === "critical"
              ? `${demo.name} attempted a transfer near its daily policy limit.`
              : `${demo.name} has used a large share of its daily spend budget.`
          }
        )
      `;
      }
    }
    await logAudit(
      userId,
      "workspace_seeded",
      "Demo fleet enrolled with sample policy and history.",
    );
  }
  await hydrateDemoAgents(userId);
  await seedSampleHold(userId);
}

async function seedSampleHold(userId: string) {
  const sql = await getSql();
  const existingHold = await sql<{ c: number }>`
    select count(*)::int as c from pending_approvals
    where user_id = ${userId}
  `;
  if (num(existingHold[0]?.c) > 0) return;
  const first = (
    await sql<{ id: string; chain: string; address: string }>`
      select id, chain, address from agents
      where user_id = ${userId} and is_demo = true
      order by created_at
      limit 1
    `
  )[0];
  if (!first) return;
  const txId = uid();
  const dest = fakeAddr(first.id + "hold-sample", first.chain as ChainId);
  await sql`
    insert into transactions (
      id, agent_id, user_id, chain, tx_hash, from_address, to_address,
      value_usd, value_native, kind, is_violation, status, timestamp, source
    ) values (
      ${txId}, ${first.id}, ${userId}, ${first.chain as ChainId}, ${`presign:${txId}`},
      ${first.address}, ${dest}, ${2400}, ${"0.75"}, ${"Pre-sign check"}, ${true},
      ${"held"}, ${new Date().toISOString()}, ${"presign"}
    )
  `;
  await insertHold({
    userId,
    agentId: first.id,
    txId,
    to: dest,
    valueUsd: 2400,
    reasons: ["First-time destination — waiting for you."],
  });
}

async function loadEntitlement(userId: string): Promise<Entitlement> {
  const sql = await getSql();
  const rows = await sql<{
    plan: string;
    status: string;
    trial_ends_at: string | null;
    period_ends_at: string | null;
  }>`
    select plan, status, trial_ends_at, period_ends_at from subscriptions where user_id = ${userId}
  `;
  const ent = evaluateEntitlement(
    rows[0] ?? { plan: "free", status: "expired", trial_ends_at: null, period_ends_at: null },
  );
  if (ent.expired && rows[0]?.status !== "expired") {
    await sql`update subscriptions set status = ${"expired"}, updated_at = ${new Date().toISOString()} where user_id = ${userId}`;
    await sql`update agents set is_paused = true where user_id = ${userId}`;
    await logAudit(userId, "trial_expired", "1-day free trial ended. Agents paused.");
  }
  return ent;
}

async function requireWritable(userId: string) {
  const ent = await loadEntitlement(userId);
  if (!ent.writable) {
    throw new Error("Your 1-day free trial has ended. Upgrade to resume monitoring.");
  }
  return ent;
}

async function ingestLiveAgent(opts: {
  agent: AgentRow;
  userId: string;
  policy: PolicyRow;
  alertNew: boolean;
}) {
  const sql = await getSql();
  const [balance, transfers] = await Promise.all([
    readNativeBalance(opts.agent.chain, opts.agent.address),
    readRecentTransfers(opts.agent.chain, opts.agent.address),
  ]);
  await sql`update agents set balance_usd = ${balance.ok ? balance.usd : opts.agent.balance_usd}, last_synced_at = ${new Date().toISOString()} where id = ${opts.agent.id} and user_id = ${opts.userId}`;

  const existing = await sql<{ tx_hash: string }>`
    select tx_hash from transactions where agent_id = ${opts.agent.id} order by timestamp desc limit 120
  `;
  const have = new Set(existing.map((r) => r.tx_hash));
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const hour = new Date(Date.now() - 3600 * 1000).toISOString();
  let created = 0;
  let worst: AgentRow["status"] = "healthy";
  for (const tx of transfers) {
    if (have.has(tx.hash)) continue;
    const volRows = await sql<{ vol: string }>`
      select coalesce(sum(value_usd),0)::text as vol from transactions
      where agent_id = ${opts.agent.id} and timestamp >= ${since}
    `;
    const hourRows = await sql<{ c: number }>`
      select count(*)::int as c from transactions
      where agent_id = ${opts.agent.id} and timestamp >= ${hour}
    `;
    const verdict = evaluateTransfer({
      valueUsd: tx.valueUsd,
      to: tx.to,
      usedTodayUsd: num(volRows[0]?.vol),
      txsLastHour: num(hourRows[0]?.c),
      paused: opts.agent.is_paused,
      policy: opts.policy,
    });
    const blocked = verdict.action === "block";
    const held = verdict.action === "hold";
    await sql`
      insert into transactions (
        id, agent_id, user_id, chain, tx_hash, from_address, to_address,
        value_usd, value_native, kind, is_violation, status, timestamp, source
      ) values (
        ${uid()}, ${opts.agent.id}, ${opts.userId}, ${opts.agent.chain}, ${tx.hash},
        ${tx.from}, ${tx.to}, ${tx.valueUsd}, ${String(tx.valueNative)},
        ${tx.kind}, ${blocked || held}, ${blocked ? "blocked" : tx.status}, ${tx.timestamp}, ${"onchain"}
      )
    `;
    created += 1;
    if (blocked) worst = "critical";
    else if ((held || verdict.action === "alert") && worst !== "critical") worst = "warning";
    if (opts.alertNew && (blocked || held || verdict.action === "alert")) {
      await sql`
        insert into alerts (id, agent_id, user_id, type, severity, message)
        values (
          ${uid()}, ${opts.agent.id}, ${opts.userId},
          ${blocked ? "policy_block" : held ? "policy_hold" : "policy_alert"},
          ${blocked ? "critical" : "warning"},
          ${`${opts.agent.name}: on-chain ${tx.kind} ${verdict.reasons[0]}`}
        )
      `;
    }
  }
  if (created > 0) {
    await sql`update agents set status = ${worst} where id = ${opts.agent.id} and user_id = ${opts.userId}`;
  }
  return { created, balanceUsd: balance.ok ? balance.usd : 0 };
}

export const bootstrapGuard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureWorkspace(context.userId);
    return { ok: true };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureWorkspace(context.userId);
    const entitlement = await loadEntitlement(context.userId);
    const sql = await getSql();
    const agents = (
      await sql`select * from agents where user_id = ${context.userId} order by created_at`
    ).map(mapAgent);
    if (entitlement.expired) {
      const liveCount = agents.filter((a) => !a.is_demo).length;
      const demoCount = agents.filter((a) => a.is_demo).length;
      return {
        agents: agents.map((a) => ({ ...a, api_key: "" })),
        policies: {},
        volume: {},
        txs: [],
        alerts: [],
        audit: [],
        spendSeries: [],
        velocity: [],
        plan: entitlement.plan,
        planStatus: entitlement.status,
        trialEndsAt: entitlement.trialEndsAt,
        capital: 0,
        volume24h: 0,
        onchainUsd: 0,
        volumeHint: "Monitoring paused",
        onchainHint: "Monitoring paused",
        liveCount,
        demoCount,
        openAlerts: 0,
        risk: "Paused",
        agentLimit: entitlement.agentLimit,
        expired: true,
        writable: false,
        msLeft: entitlement.msLeft,
        protection: {
          score: 0,
          label: "Exposed" as const,
          notes: ["Trial ended — monitoring is paused until you upgrade."],
        },
      };
    }
    const policiesRaw = await sql`
      select * from policies where user_id = ${context.userId}
    `;
    const policies = Object.fromEntries(policiesRaw.map((p) => [String(p.agent_id), mapPolicy(p)]));
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const volumeRows = await sql<{ agent_id: string; vol: string }>`
      select agent_id, coalesce(sum(value_usd), 0)::text as vol
      from transactions
      where user_id = ${context.userId} and timestamp >= ${since}
      group by agent_id
    `;
    const volume: Record<string, number> = {};
    for (const row of volumeRows) volume[row.agent_id] = num(row.vol);

    const txs = (
      await sql`
        select * from transactions
        where user_id = ${context.userId}
        order by timestamp desc
        limit 40
      `
    ).map(mapTx);

    const alerts = (
      await sql`
        select a.*, ag.name as agent_name
        from alerts a
        join agents ag on ag.id = a.agent_id
        where a.user_id = ${context.userId}
        order by a.created_at desc
        limit 30
      `
    ).map((a) => ({
      id: String(a.id),
      agent_id: String(a.agent_id),
      type: String(a.type),
      severity: a.severity as AlertRow["severity"],
      message: String(a.message),
      acknowledged: Boolean(a.acknowledged),
      created_at: String(a.created_at),
      agent_name: String(a.agent_name ?? ""),
    })) as AlertRow[];

    const spendSeries = await sql<{ bucket: string; vol: string }>`
      select to_char(date_trunc('hour', timestamp), 'YYYY-MM-DD HH24:00') as bucket,
             coalesce(sum(value_usd),0)::text as vol
      from transactions
      where user_id = ${context.userId} and timestamp >= ${since}
      group by 1
      order by 1
    `;
    const velocity = await sql<{ bucket: string; c: number }>`
      select to_char(date_trunc('hour', timestamp), 'YYYY-MM-DD HH24:00') as bucket,
             count(*)::int as c
      from transactions
      where user_id = ${context.userId} and timestamp >= ${since}
      group by 1
      order by 1
    `;

    const audit = (
      await sql`
        select id, agent_id, action, detail, created_at
        from audit_events
        where user_id = ${context.userId}
        order by created_at desc
        limit 16
      `
    ).map((r) => ({
      id: String(r.id),
      agent_id: r.agent_id ? String(r.agent_id) : null,
      action: String(r.action),
      detail: String(r.detail),
      created_at: String(r.created_at),
    })) as AuditRow[];

    const liveCount = agents.filter((a) => !a.is_demo).length;
    const demoCount = agents.filter((a) => a.is_demo).length;
    const liveVolume = agents
      .filter((a) => !a.is_demo)
      .reduce((s, a) => s + (volume[a.id] ?? 0), 0);
    const demoVolume = agents.filter((a) => a.is_demo).reduce((s, a) => s + (volume[a.id] ?? 0), 0);
    const volume24h = liveVolume + demoVolume;
    const liveUsd = agents.filter((a) => !a.is_demo).reduce((s, a) => s + a.balance_usd, 0);
    const demoUsd = agents.filter((a) => a.is_demo).reduce((s, a) => s + a.balance_usd, 0);
    const onchainUsd = liveUsd > 0 ? liveUsd : demoUsd;
    const volumeHint =
      liveVolume === 0 && demoVolume > 0
        ? "Demo · sample volume"
        : "Transfer volume — not treasury size";
    const onchainHint =
      liveUsd > 0
        ? "Native balance of live wallets"
        : demoUsd > 0
          ? "Demo · sample balances"
          : liveCount > 0
            ? "Live wallets returned $0 from chain"
            : "Enroll a live wallet to fetch chain balance";
    const openAlerts = alerts.filter((a) => !a.acknowledged).length;
    const openCritical = alerts.filter((a) => !a.acknowledged && a.severity === "critical").length;
    const risk = agents.some((a) => a.status === "critical" && !a.is_paused)
      ? "High"
      : agents.some((a) => a.status === "warning")
        ? "Medium"
        : "Low";

    const protection = protectionScore({
      agentCount: agents.length,
      allowlisted: agents.filter((a) => (policies[a.id]?.allowlist.length ?? 0) > 0).length,
      tightTxCap: agents.filter((a) => {
        const p = policies[a.id];
        return p ? p.max_tx_amount_usd <= p.daily_limit_usd * 0.25 : false;
      }).length,
      openCritical,
      paid: entitlement.plan !== "free",
      expired: entitlement.expired,
    });

    return {
      agents,
      policies,
      volume,
      txs,
      alerts,
      audit,
      spendSeries: spendSeries.map((r) => ({ t: r.bucket, v: num(r.vol) })),
      velocity: velocity.map((r) => ({ t: r.bucket, v: num(r.c) })),
      plan: entitlement.plan,
      planStatus: entitlement.status,
      trialEndsAt: entitlement.trialEndsAt,
      capital: volume24h,
      volume24h,
      onchainUsd,
      volumeHint,
      onchainHint,
      liveCount,
      demoCount,
      openAlerts,
      risk,
      agentLimit: entitlement.agentLimit,
      expired: entitlement.expired,
      writable: entitlement.writable,
      msLeft: entitlement.msLeft,
      protection,
    };
  });

const agentInput = z.object({
  name: z.string().min(2).max(80),
  address: z.string().min(8).max(80),
  chain: z.enum(["base", "ethereum", "solana"]),
  role: z.string().max(60).optional(),
});

export const createAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => agentInput.parse(d))
  .handler(async ({ context, data }) => {
    if (!validateAddress(data.chain, data.address)) {
      throw new Error(`That does not look like a valid ${CHAINS[data.chain].name} address.`);
    }
    const sql = await getSql();
    const ent = await requireWritable(context.userId);
    const limit = ent.agentLimit;
    const count = await sql<{ c: number }>`
      select count(*)::int as c from agents
      where user_id = ${context.userId} and is_demo = false
    `;
    if (num(count[0]?.c) >= limit) {
      throw new Error(
        `Your ${ent.plan} plan allows ${limit} live agent wallets. Demo samples do not count. Upgrade to add more.`,
      );
    }
    const id = uid();
    const apiKey = generateApiKey();
    await sql`
      insert into agents (id, user_id, name, address, chain, role, is_demo, api_key)
      values (${id}, ${context.userId}, ${data.name.trim()}, ${data.address.trim()}, ${data.chain}, ${data.role?.trim() || "Agent"}, ${false}, ${apiKey})
    `;
    await sql`
      insert into policies (id, agent_id, user_id)
      values (${uid()}, ${id}, ${context.userId})
    `;
    await logAudit(
      context.userId,
      "agent_added",
      `Enrolled live wallet ${data.name.trim()} on ${data.chain}.`,
      id,
    );
    const created = (
      await sql`select * from agents where id = ${id} and user_id = ${context.userId}`
    ).map(mapAgent)[0];
    const policy = (
      await sql`select * from policies where agent_id = ${id} and user_id = ${context.userId}`
    ).map(mapPolicy)[0];
    if (created && policy) {
      try {
        await ingestLiveAgent({ agent: created, userId: context.userId, policy, alertNew: false });
      } catch {
        /* chain read is best-effort */
      }
    }
    return { id, api_key: apiKey };
  });

export const updateAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string(),
        name: z.string().min(2).max(80).optional(),
        is_paused: z.boolean().optional(),
        status: z.enum(["healthy", "warning", "critical"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const sql = await getSql();
    if (data.name) {
      await sql`update agents set name = ${data.name} where id = ${data.id} and user_id = ${context.userId}`;
    }
    if (data.is_paused !== undefined) {
      await sql`update agents set is_paused = ${data.is_paused} where id = ${data.id} and user_id = ${context.userId}`;
      await logAudit(
        context.userId,
        data.is_paused ? "agent_paused" : "agent_resumed",
        data.is_paused ? "Kill switch engaged." : "Agent resumed.",
        data.id,
      );
    }
    if (data.status) {
      await sql`update agents set status = ${data.status} where id = ${data.id} and user_id = ${context.userId}`;
    }
    return { ok: true };
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const sql = await getSql();
    await sql`delete from alerts where agent_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from transactions where agent_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from pending_approvals where agent_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from audit_reports where agent_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from policies where agent_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from agents where id = ${data.id} and user_id = ${context.userId}`;
    await logAudit(context.userId, "agent_removed", "Agent removed from the console.", data.id);
    return { ok: true };
  });

export const savePolicy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        agent_id: z.string(),
        daily_limit_usd: z.number().positive(),
        max_tx_amount_usd: z.number().positive(),
        alert_threshold_usd: z.number().positive(),
        allowlist: z.array(z.string()).max(40),
        denylist: z.array(z.string()).max(40),
        max_hourly_txs: z.number().int().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const sql = await getSql();
    const allow = JSON.stringify(data.allowlist);
    const deny = JSON.stringify(data.denylist);
    await sql`
      update policies
      set daily_limit_usd = ${data.daily_limit_usd},
          max_tx_amount_usd = ${data.max_tx_amount_usd},
          alert_threshold_usd = ${data.alert_threshold_usd},
          allowlist = ${allow}::jsonb,
          denylist = ${deny}::jsonb,
          max_hourly_txs = ${data.max_hourly_txs}
      where agent_id = ${data.agent_id} and user_id = ${context.userId}
    `;
    await logAudit(
      context.userId,
      "policy_updated",
      `Daily $${data.daily_limit_usd}, max tx $${data.max_tx_amount_usd}, hourly ${data.max_hourly_txs}.`,
      data.agent_id,
    );
    return { ok: true };
  });

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const sql = await getSql();
    await sql`update alerts set acknowledged = true where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const scanAgents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireWritable(context.userId);
    await hydrateDemoAgents(context.userId);
    const sql = await getSql();
    const agents = (await sql`select * from agents where user_id = ${context.userId}`).map(
      mapAgent,
    );
    const policiesRaw = await sql`select * from policies where user_id = ${context.userId}`;
    const policyBy = Object.fromEntries(policiesRaw.map((p) => [String(p.agent_id), mapPolicy(p)]));
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const hour = new Date(Date.now() - 3600 * 1000).toISOString();
    const profile = await sql<{ email_alerts: boolean; telegram_alerts: boolean }>`
      select email_alerts, telegram_alerts from profiles where user_id = ${context.userId}
    `;
    let created = 0;
    let onchain = 0;
    for (const agent of agents) {
      const policy = policyBy[agent.id];
      if (!policy) continue;
      if (!agent.is_demo) {
        const r = await ingestLiveAgent({
          agent,
          userId: context.userId,
          policy,
          alertNew: Boolean(agent.last_synced_at),
        });
        created += r.created;
        onchain += r.created;
        continue;
      }
      if (agent.is_paused) continue;
      if (agent.balance_usd <= 0) {
        const usd = demoSampleUsd(agent.address);
        await sql`
          update agents
          set balance_usd = ${usd}, last_synced_at = ${new Date().toISOString()}
          where id = ${agent.id} and user_id = ${context.userId}
        `;
      }
      const volRows = await sql<{ vol: string }>`
        select coalesce(sum(value_usd),0)::text as vol from transactions
        where agent_id = ${agent.id} and timestamp >= ${since}
      `;
      const hourRows = await sql<{ c: number }>`
        select count(*)::int as c from transactions
        where agent_id = ${agent.id} and timestamp >= ${hour}
      `;
      const used = num(volRows[0]?.vol);
      const txsLastHour = num(hourRows[0]?.c);
      const value = 80 + (hashStr(agent.id + String(Date.now())) % 900);
      const offList =
        policy.allowlist.length > 0 && hashStr(agent.id + String(Date.now())) % 3 === 0;
      const to = offList
        ? fakeAddr(agent.id + "off", agent.chain)
        : (policy.allowlist[0] ?? fakeAddr(agent.id + "scan", agent.chain));
      const verdict = evaluateTransfer({
        valueUsd: value,
        to,
        usedTodayUsd: used,
        txsLastHour,
        paused: agent.is_paused,
        policy,
      });
      const blocked = verdict.action === "block";
      const held = verdict.action === "hold";
      const kind = blocked
        ? "Policy Block"
        : held
          ? "Waiting for you"
          : verdict.action === "alert"
            ? "Policy Alert"
            : "Transfer";
      const txId = uid();
      await sql`
        insert into transactions (
          id, agent_id, user_id, chain, tx_hash, from_address, to_address,
          value_usd, value_native, kind, is_violation, status, timestamp, source
        ) values (
          ${txId}, ${agent.id}, ${context.userId}, ${agent.chain},
          ${fakeHash(agent.id + Date.now(), agent.chain)},
          ${agent.address}, ${to},
          ${value}, ${String((value / 3200).toFixed(4))}, ${kind}, ${blocked || held},
          ${blocked ? "blocked" : held ? "held" : "success"}, ${new Date().toISOString()}, ${"demo"}
        )
      `;
      created += 1;
      const ratio = (used + value) / policy.daily_limit_usd;
      const status =
        blocked || ratio > 0.9
          ? "critical"
          : ratio > 0.65 || verdict.action === "alert" || held
            ? "warning"
            : "healthy";
      await sql`update agents set status = ${status} where id = ${agent.id} and user_id = ${context.userId}`;
      if (held) {
        await insertHold({
          userId: context.userId,
          agentId: agent.id,
          txId,
          to,
          valueUsd: value,
          reasons: verdict.reasons,
        });
      }
      if (blocked || held || verdict.action === "alert") {
        const severity = blocked ? "critical" : "warning";
        const message = `${agent.name}: ${verdict.reasons[0]}`;
        await sql`
          insert into alerts (id, agent_id, user_id, type, severity, message)
          values (
            ${uid()}, ${agent.id}, ${context.userId},
            ${blocked ? "policy_block" : held ? "approval_hold" : "policy_alert"}, ${severity}, ${message}
          )
        `;
        await logAudit(
          context.userId,
          blocked ? "policy_block" : held ? "presign_hold" : "policy_alert",
          message,
          agent.id,
        );
        if (blocked && profile[0]?.email_alerts) {
          await queueNotice(context.userId, "email", message);
        }
        if (blocked && profile[0]?.telegram_alerts) {
          await queueNotice(context.userId, "telegram", message);
        }
      }
    }
    return { created, onchain };
  });

export const simulateTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        agent_id: z.string(),
        to: z.string().min(4).max(80),
        value_usd: z.number().positive(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const sql = await getSql();
    const agents = (
      await sql`select * from agents where id = ${data.agent_id} and user_id = ${context.userId}`
    ).map(mapAgent);
    const agent = agents[0];
    if (!agent) throw new Error("Agent not found.");
    const policies = (
      await sql`select * from policies where agent_id = ${agent.id} and user_id = ${context.userId}`
    ).map(mapPolicy);
    const policy = policies[0];
    if (!policy) throw new Error("No policy on this agent.");
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const hour = new Date(Date.now() - 3600 * 1000).toISOString();
    const volRows = await sql<{ vol: string }>`
      select coalesce(sum(value_usd),0)::text as vol from transactions
      where agent_id = ${agent.id} and timestamp >= ${since}
    `;
    const hourRows = await sql<{ c: number }>`
      select count(*)::int as c from transactions where agent_id = ${agent.id} and timestamp >= ${hour}
    `;
    const verdict = evaluateTransfer({
      valueUsd: data.value_usd,
      to: data.to,
      usedTodayUsd: num(volRows[0]?.vol),
      txsLastHour: num(hourRows[0]?.c),
      paused: agent.is_paused,
      policy,
    });
    await logAudit(
      context.userId,
      "simulation",
      `${verdict.action.toUpperCase()} $${data.value_usd.toFixed(0)} → ${data.to.slice(0, 12)}…`,
      agent.id,
    );
    return {
      ...verdict,
      usedTodayUsd: num(volRows[0]?.vol),
      txsLastHour: num(hourRows[0]?.c),
      daily_limit_usd: policy.daily_limit_usd,
    };
  });

export const getOnchain = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const agents = (
      await sql`select * from agents where id = ${data.id} and user_id = ${context.userId}`
    ).map(mapAgent);
    const agent = agents[0];
    if (!agent) throw new Error("Agent not found.");
    if (agent.is_demo) {
      const usd = agent.balance_usd > 0 ? agent.balance_usd : demoSampleUsd(agent.address);
      return {
        chain: agent.chain,
        address: agent.address,
        native: demoNative(agent.chain, usd),
        usd,
        ok: true,
        demo: true,
        symbol: CHAINS[agent.chain].native,
      };
    }
    const balance = await readNativeBalance(agent.chain, agent.address);
    return { chain: agent.chain, address: agent.address, ...balance, demo: false };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureWorkspace(context.userId);
    const sql = await getSql();
    const p = await sql`
      select telegram_chat_id, email_alerts, telegram_alerts, webhook_url from profiles where user_id = ${context.userId}
    `;
    const notices = await sql`
      select id, channel, message, created_at from notification_log
      where user_id = ${context.userId}
      order by created_at desc
      limit 8
    `;
    const ent = await loadEntitlement(context.userId);
    const agentCountRows = await sql<{ c: number }>`
      select count(*)::int as c from agents where user_id = ${context.userId}
    `;
    return {
      telegram_chat_id: String(p[0]?.telegram_chat_id ?? ""),
      email_alerts: Boolean(p[0]?.email_alerts ?? true),
      telegram_alerts: Boolean(p[0]?.telegram_alerts ?? false),
      webhook_url: String(p[0]?.webhook_url ?? ""),
      notices: notices.map((n) => ({
        id: String(n.id),
        channel: String(n.channel),
        message: String(n.message),
        created_at: String(n.created_at),
      })),
      plan: ent.plan,
      planStatus: ent.status,
      trialEndsAt: ent.trialEndsAt,
      periodEndsAt: ent.periodEndsAt,
      agentLimit: ent.agentLimit,
      agentCount: num(agentCountRows[0]?.c),
      expired: ent.expired,
      writable: ent.writable,
      msLeft: ent.msLeft,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        telegram_chat_id: z.string().max(40),
        email_alerts: z.boolean(),
        telegram_alerts: z.boolean(),
        webhook_url: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const url = data.webhook_url.trim();
    if (url && !url.startsWith("https://")) {
      throw new Error("Webhook must be an https URL.");
    }
    const sql = await getSql();
    await sql`
      update profiles
      set telegram_chat_id = ${data.telegram_chat_id},
          email_alerts = ${data.email_alerts},
          telegram_alerts = ${data.telegram_alerts},
          webhook_url = ${url}
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const changePlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ plan: z.enum(["starter", "pro", "team"]) }).parse(d))
  .handler(async () => {
    throw new Error("Plans are paid in USDC on Solana, Ethereum, or Base. Open Billing.");
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    const sql = await getSql();
    const key = generateApiKey();
    await sql`update agents set api_key = ${key} where id = ${data.id} and user_id = ${context.userId}`;
    await logAudit(context.userId, "api_key_rotated", "Pre-sign API key rotated.", data.id);
    return { api_key: key };
  });

export const getHoldCount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureSchema();
    const count = await countOpenHolds(context.userId);
    return { count };
  });

export const getInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureWorkspace(context.userId);
    const items = await listOpenHolds(context.userId);
    const ent = await loadEntitlement(context.userId);
    return { items, writable: ent.writable };
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string(),
        decision: z.enum(["allow", "always", "block"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireWritable(context.userId);
    await ensureSchema();
    const sql = await getSql();
    const now = new Date().toISOString();
    const rows = await sql`
      select * from pending_approvals
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    if (String(row.status) !== "hold") throw new Error("This request was already decided.");
    if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
      await sql`
        update pending_approvals set status = ${"expired"}, decided_at = ${now}
        where id = ${data.id} and user_id = ${context.userId}
      `;
      throw new Error("This request expired. The agent must not sign.");
    }

    const toAddr = String(row.to_address);
    const agentId = String(row.agent_id);
    const txId = row.tx_id ? String(row.tx_id) : null;

    if (data.decision === "always") {
      const pol =
        await sql`select allowlist from policies where agent_id = ${agentId} and user_id = ${context.userId}`;
      const list = asStrings(pol[0]?.allowlist);
      const exists = list.some((a) => a.toLowerCase() === toAddr.toLowerCase());
      if (!exists) {
        const next = JSON.stringify([...list, toAddr]);
        await sql`
          update policies set allowlist = ${next}::jsonb
          where agent_id = ${agentId} and user_id = ${context.userId}
        `;
      }
    }

    if (data.decision === "block") {
      if (txId) {
        await sql`
          update transactions
          set status = ${"blocked"}, is_violation = ${true}
          where id = ${txId} and user_id = ${context.userId}
        `;
      }
      await sql`update agents set status = ${"critical"} where id = ${agentId} and user_id = ${context.userId}`;
      await sql`
        insert into alerts (id, agent_id, user_id, type, severity, message)
        values (
          ${uid()}, ${agentId}, ${context.userId},
          ${"presign_block"}, ${"critical"},
          ${`You blocked $${num(row.value_usd).toFixed(0)} to ${toAddr.slice(0, 18)}`}
        )
      `;
    } else if (txId) {
      await sql`
        update transactions
        set status = ${"success"}, is_violation = ${false}, kind = ${"Pre-sign approved"}
        where id = ${txId} and user_id = ${context.userId}
      `;
    }

    await sql`
      update pending_approvals
      set status = ${data.decision}, decided_at = ${now}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    await logAudit(
      context.userId,
      data.decision === "block"
        ? "approval_block"
        : data.decision === "always"
          ? "approval_always"
          : "approval_allow",
      `${data.decision.toUpperCase()} $${num(row.value_usd).toFixed(0)} → ${toAddr.slice(0, 18)}`,
      agentId,
    );
    return { ok: true, decision: data.decision };
  });
