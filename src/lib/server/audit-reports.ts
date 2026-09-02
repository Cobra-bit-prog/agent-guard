import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  AUDIT_DISCLAIMER,
  auditFileStem,
  buildAuditTrail,
  type AuditSnapshot,
} from "@/lib/audit-report";
import { bytesToBase64, buildPdf, buildXlsx } from "@/lib/server/report-files";
import { uid } from "@/lib/utils";

function num(v: unknown) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export async function ensureAuditReportsTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists audit_reports (
      id text primary key,
      user_id text not null,
      agent_id text not null,
      agent_name text not null,
      agent_address text not null,
      chain text not null,
      row_count integer not null,
      snapshot jsonb not null,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(
    `create index if not exists audit_reports_user_idx on audit_reports (user_id, created_at desc)`,
  );
  await sql.query(
    `create index if not exists audit_reports_agent_idx on audit_reports (agent_id, created_at desc)`,
  );
}

function parseSnapshot(raw: unknown): AuditSnapshot {
  if (typeof raw === "string") {
    return JSON.parse(raw) as AuditSnapshot;
  }
  return raw as AuditSnapshot;
}

export const generateAuditReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        agent_id: z.string().optional(),
        address: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureAuditReportsTable();
    const sql = await getSql();
    const id = data.agent_id?.trim();
    const address = data.address?.trim();
    if (!id && !address) {
      throw new Error("Pick an enrolled agent, or paste its wallet address.");
    }
    const agents = id
      ? await sql`select * from agents where id = ${id} and user_id = ${context.userId}`
      : await sql`
          select * from agents
          where user_id = ${context.userId}
            and lower(address) = ${address!.toLowerCase()}
        `;
    const agent = agents[0];
    if (!agent) throw new Error("No enrolled agent matches that wallet.");

    const txs = await sql`
      select timestamp, to_address, value_usd, kind, status, is_violation, source
      from transactions
      where agent_id = ${String(agent.id)} and user_id = ${context.userId}
      order by timestamp desc
      limit 250
    `;
    const alerts = await sql`
      select created_at, severity, message, type
      from alerts
      where agent_id = ${String(agent.id)} and user_id = ${context.userId}
      order by created_at desc
      limit 100
    `;
    const decisions = await sql`
      select created_at, action, detail
      from audit_events
      where agent_id = ${String(agent.id)} and user_id = ${context.userId}
      order by created_at desc
      limit 100
    `;

    const rows = buildAuditTrail({
      chain: String(agent.chain),
      transactions: txs.map((t) => ({
        timestamp: String(t.timestamp),
        to_address: String(t.to_address),
        value_usd: num(t.value_usd),
        kind: String(t.kind),
        status: String(t.status),
        is_violation: Boolean(t.is_violation),
        source: String(t.source ?? "onchain"),
      })),
      alerts: alerts.map((a) => ({
        created_at: String(a.created_at),
        severity: String(a.severity),
        message: String(a.message),
        type: String(a.type),
      })),
      decisions: decisions.map((d) => ({
        created_at: String(d.created_at),
        action: String(d.action),
        detail: String(d.detail),
      })),
    });

    const generatedAt = new Date().toISOString();
    const snapshot: AuditSnapshot = {
      generatedAt,
      disclaimer: AUDIT_DISCLAIMER,
      agent: {
        id: String(agent.id),
        name: String(agent.name),
        address: String(agent.address),
        chain: String(agent.chain),
      },
      rows,
    };
    const reportId = uid();
    const payload = JSON.stringify(snapshot);
    await sql`
      insert into audit_reports (
        id, user_id, agent_id, agent_name, agent_address, chain, row_count, snapshot
      ) values (
        ${reportId}, ${context.userId}, ${String(agent.id)}, ${String(agent.name)},
        ${String(agent.address)}, ${String(agent.chain)}, ${rows.length}, ${payload}::jsonb
      )
    `;
    return {
      id: reportId,
      generatedAt,
      disclaimer: AUDIT_DISCLAIMER,
      agent: snapshot.agent,
      rowCount: rows.length,
      preview: rows.slice(0, 40),
    };
  });

export const listAuditReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureAuditReportsTable();
    const sql = await getSql();
    const rows = await sql`
      select id, agent_id, agent_name, agent_address, chain, row_count, created_at
      from audit_reports
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
    return {
      reports: rows.map((r) => ({
        id: String(r.id),
        agent_id: String(r.agent_id),
        agent_name: String(r.agent_name),
        agent_address: String(r.agent_address),
        chain: String(r.chain),
        row_count: num(r.row_count),
        created_at: String(r.created_at),
      })),
    };
  });

export const downloadAuditReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string(),
        format: z.enum(["xlsx", "pdf"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureAuditReportsTable();
    const sql = await getSql();
    const rows = await sql`
      select agent_name, snapshot, created_at
      from audit_reports
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Report not found.");
    const snapshot = parseSnapshot(row.snapshot);
    const stem = auditFileStem(String(row.agent_name), String(row.created_at));
    if (data.format === "xlsx") {
      const bytes = buildXlsx(snapshot);
      return {
        filename: `${stem}.xlsx`,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: bytesToBase64(bytes),
      };
    }
    const bytes = buildPdf(snapshot);
    return {
      filename: `${stem}.pdf`,
      mime: "application/pdf",
      base64: bytesToBase64(bytes),
    };
  });
