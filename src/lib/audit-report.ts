export type AuditKind = "check" | "send" | "alert" | "decision";

export type AuditTrailRow = {
  timestamp: string;
  kind: AuditKind;
  chain: string;
  to: string;
  amountUsd: number | null;
  result: string;
  detail: string;
};

export type AuditSnapshot = {
  generatedAt: string;
  disclaimer: string;
  agent: {
    id: string;
    name: string;
    address: string;
    chain: string;
  };
  rows: AuditTrailRow[];
};

export const AUDIT_DISCLAIMER =
  "Agent Control audit trail: pre-sign checks, alerts, operator decisions, and recorded transfers. This is not a full on-chain replay.";

export function resultFromTx(input: {
  status: string;
  is_violation: boolean;
  kind: string;
  source: string;
}): string {
  const status = input.status.toLowerCase();
  if (status === "blocked") return "Blocked";
  if (status === "held") return "Waiting for you";
  if (status === "failed") return "Failed";
  if (input.is_violation) return "Flagged";
  if (input.source === "presign") return "Checked";
  return "Allowed";
}

export function kindFromTx(source: string): AuditKind {
  return source === "presign" ? "check" : "send";
}

export function buildAuditTrail(input: {
  chain: string;
  transactions: Array<{
    timestamp: string;
    to_address: string;
    value_usd: number;
    kind: string;
    status: string;
    is_violation: boolean;
    source: string;
  }>;
  alerts: Array<{
    created_at: string;
    severity: string;
    message: string;
    type: string;
  }>;
  decisions: Array<{
    created_at: string;
    action: string;
    detail: string;
  }>;
}): AuditTrailRow[] {
  const rows: AuditTrailRow[] = [];
  for (const tx of input.transactions) {
    rows.push({
      timestamp: tx.timestamp,
      kind: kindFromTx(tx.source),
      chain: input.chain,
      to: tx.to_address,
      amountUsd: tx.value_usd,
      result: resultFromTx(tx),
      detail: tx.kind,
    });
  }
  for (const alert of input.alerts) {
    rows.push({
      timestamp: alert.created_at,
      kind: "alert",
      chain: input.chain,
      to: "—",
      amountUsd: null,
      result: alert.severity,
      detail: alert.message,
    });
  }
  for (const decision of input.decisions) {
    rows.push({
      timestamp: decision.created_at,
      kind: "decision",
      chain: input.chain,
      to: "—",
      amountUsd: null,
      result: decision.action,
      detail: decision.detail,
    });
  }
  rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return rows;
}

export function auditFileStem(agentName: string, generatedAt: string) {
  const day = generatedAt.slice(0, 10);
  const slug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `agent-control-audit-${slug || "agent"}-${day}`;
}
