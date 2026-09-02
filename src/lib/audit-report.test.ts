import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_DISCLAIMER,
  auditFileStem,
  buildAuditTrail,
  kindFromTx,
  resultFromTx,
} from "./audit-report.ts";
import { buildPdf, buildXlsx, xlsxLooksValid } from "./server/report-files.ts";

describe("audit trail mapping", () => {
  it("maps presign success as a check, not a seen on-chain send", () => {
    assert.equal(kindFromTx("presign"), "check");
    assert.equal(
      resultFromTx({
        status: "success",
        is_violation: false,
        kind: "Pre-sign check",
        source: "presign",
      }),
      "Checked",
    );
  });

  it("maps held and blocked outcomes for operators", () => {
    assert.equal(
      resultFromTx({
        status: "held",
        is_violation: true,
        kind: "Pre-sign check",
        source: "presign",
      }),
      "Waiting for you",
    );
    assert.equal(
      resultFromTx({
        status: "blocked",
        is_violation: true,
        kind: "Policy Block",
        source: "presign",
      }),
      "Blocked",
    );
  });

  it("merges checks, sends, alerts, and decisions newest first", () => {
    const rows = buildAuditTrail({
      chain: "base",
      transactions: [
        {
          timestamp: "2026-09-02T10:00:00.000Z",
          to_address: "0xabc",
          value_usd: 100,
          kind: "Transfer",
          status: "success",
          is_violation: false,
          source: "onchain",
        },
      ],
      alerts: [
        {
          created_at: "2026-09-02T11:00:00.000Z",
          severity: "warning",
          message: "Over alert threshold",
          type: "policy_alert",
        },
      ],
      decisions: [
        {
          created_at: "2026-09-02T12:00:00.000Z",
          action: "approval_allow",
          detail: "ALLOW $2400 → 0x91c4",
        },
      ],
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.kind, "decision");
    assert.equal(rows[1]?.kind, "alert");
    assert.equal(rows[2]?.kind, "send");
    assert.equal(rows[2]?.result, "Allowed");
  });

  it("names files from the agent and generation day", () => {
    assert.equal(
      auditFileStem("Trade Agent Alpha", "2026-09-02T15:04:00.000Z"),
      "agent-control-audit-trade-agent-alpha-2026-09-02",
    );
  });

  it("states that this is the Agent Control trail, not a chain replay", () => {
    assert.match(AUDIT_DISCLAIMER, /Agent Control audit trail/i);
    assert.match(AUDIT_DISCLAIMER, /not a full on-chain replay/i);
  });
});

describe("on-demand Excel and PDF", () => {
  const snapshot = {
    generatedAt: "2026-09-02T15:04:00.000Z",
    disclaimer: AUDIT_DISCLAIMER,
    agent: {
      id: "a1",
      name: "Trade Agent Alpha",
      address: "0x7a3b91c92d4e11a8b0f6e4c8a1d2b3c4d5e6f701",
      chain: "base",
    },
    rows: buildAuditTrail({
      chain: "base",
      transactions: [
        {
          timestamp: "2026-09-02T10:42:00.000Z",
          to_address: "0x7f3ab9c1",
          value_usd: 350,
          kind: "Pre-sign check",
          status: "success",
          is_violation: false,
          source: "presign",
        },
      ],
      alerts: [],
      decisions: [],
    }),
  };

  it("builds a real xlsx zip", () => {
    const bytes = buildXlsx(snapshot);
    assert.ok(xlsxLooksValid(bytes));
    assert.ok(bytes.byteLength > 200);
  });

  it("builds a PDF with the operator table header", () => {
    const bytes = buildPdf(snapshot);
    const text = new TextDecoder("latin1").decode(bytes);
    assert.match(text, /^%PDF-1\./);
    assert.match(text, /Time/);
    assert.match(text, /Result/);
    assert.match(text, /%%EOF/);
  });
});
