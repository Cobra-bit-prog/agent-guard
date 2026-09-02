import { getSql } from "@/lib/db";
import { HOLD_TTL_MS } from "@/lib/hold";
import { uid } from "@/lib/utils";

export { HOLD_TTL_MS };

export type ApprovalStatus = "hold" | "allow" | "always" | "block" | "expired";

export type ApprovalRow = {
  id: string;
  user_id: string;
  agent_id: string;
  tx_id: string | null;
  to_address: string;
  value_usd: number;
  native: string | null;
  reasons: string[];
  status: ApprovalStatus;
  expires_at: string;
  decided_at: string | null;
  created_at: string;
  agent_name?: string;
  chain?: string;
};

function num(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function asStrings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export function mapApproval(r: Record<string, unknown>): ApprovalRow {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    agent_id: String(r.agent_id),
    tx_id: r.tx_id ? String(r.tx_id) : null,
    to_address: String(r.to_address),
    value_usd: num(r.value_usd),
    native: r.native ? String(r.native) : null,
    reasons: asStrings(r.reasons),
    status: String(r.status) as ApprovalStatus,
    expires_at: String(r.expires_at),
    decided_at: r.decided_at ? String(r.decided_at) : null,
    created_at: String(r.created_at),
    agent_name: r.agent_name ? String(r.agent_name) : undefined,
    chain: r.chain ? String(r.chain) : undefined,
  };
}

export async function ensureApprovalsTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists pending_approvals (
      id text primary key,
      user_id text not null,
      agent_id text not null,
      tx_id text,
      to_address text not null,
      value_usd numeric not null,
      native text,
      reasons jsonb not null default '[]',
      status text not null default 'hold',
      expires_at timestamptz not null,
      decided_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(
    `create index if not exists pending_approvals_user_status_idx on pending_approvals (user_id, status, created_at desc)`,
  );
  await sql.query(
    `create index if not exists pending_approvals_agent_idx on pending_approvals (agent_id, status)`,
  );
}

export async function expireHolds(scope?: { userId?: string; agentId?: string }) {
  const sql = await getSql();
  const now = new Date().toISOString();
  if (scope?.agentId) {
    await sql`
      update pending_approvals
      set status = ${"expired"}, decided_at = ${now}
      where agent_id = ${scope.agentId} and status = ${"hold"} and expires_at <= ${now}
    `;
    return;
  }
  if (scope?.userId) {
    await sql`
      update pending_approvals
      set status = ${"expired"}, decided_at = ${now}
      where user_id = ${scope.userId} and status = ${"hold"} and expires_at <= ${now}
    `;
    return;
  }
  await sql`
    update pending_approvals
    set status = ${"expired"}, decided_at = ${now}
    where status = ${"hold"} and expires_at <= ${now}
  `;
}

export async function insertHold(input: {
  userId: string;
  agentId: string;
  txId: string;
  to: string;
  valueUsd: number;
  native?: string;
  reasons: string[];
}): Promise<{ id: string; expiresAt: string; expiresInS: number }> {
  const sql = await getSql();
  const id = uid();
  const expiresAt = new Date(Date.now() + HOLD_TTL_MS).toISOString();
  const reasons = JSON.stringify(input.reasons);
  await sql`
    insert into pending_approvals (
      id, user_id, agent_id, tx_id, to_address, value_usd, native, reasons, status, expires_at
    ) values (
      ${id}, ${input.userId}, ${input.agentId}, ${input.txId}, ${input.to},
      ${input.valueUsd}, ${input.native ?? null}, ${reasons}::jsonb, ${"hold"}, ${expiresAt}
    )
  `;
  return { id, expiresAt, expiresInS: Math.round(HOLD_TTL_MS / 1000) };
}

export async function getApprovalForAgent(opts: { approvalId: string; agentId: string }) {
  await expireHolds({ agentId: opts.agentId });
  const sql = await getSql();
  const rows = await sql`
    select * from pending_approvals
    where id = ${opts.approvalId} and agent_id = ${opts.agentId}
  `;
  const row = rows[0];
  if (!row) return null;
  return mapApproval(row);
}

export async function listOpenHolds(userId: string): Promise<ApprovalRow[]> {
  await expireHolds({ userId });
  const sql = await getSql();
  const rows = await sql`
    select p.*, a.name as agent_name, a.chain as chain
    from pending_approvals p
    join agents a on a.id = p.agent_id
    where p.user_id = ${userId} and p.status = ${"hold"}
    order by p.created_at desc
  `;
  return rows.map(mapApproval);
}

export async function countOpenHolds(userId: string): Promise<number> {
  await expireHolds({ userId });
  const sql = await getSql();
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from pending_approvals
    where user_id = ${userId} and status = ${"hold"}
  `;
  return num(rows[0]?.c);
}
