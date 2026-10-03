import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuditTrail } from "./audit-report.ts";
import { HOLD_TTL_MS } from "./hold.ts";
import { viewInvoice, SOLANA_PAYOUT_ADDRESS } from "./pay-invoice.ts";
import { humanInboxPlan, parsePayPlan, payPlanQuote } from "./shop-shield.ts";
import {
  ACTION_GATE_CURL_CRM,
  ACTION_GATE_CURL_EMAIL,
  ACTION_GATE_CURL_SLACK,
  ACTION_GATE_DB_ENV,
  ACTION_GATE_DB_ERROR,
  ACTION_GATE_EMAIL_NOTE,
  ACTION_GATE_HREF,
  ACTION_GATE_MCP_NOTE,
  ACTION_GATE_PAY_ABSOLUTE,
  ACTION_GATE_PAY_CTA,
  ACTION_GATE_PRICE_USD,
  ACTION_GATE_SCHEMA,
  ACTION_GATE_STOP_EXAMPLE,
  actionAuditDetail,
  actionGateDatabaseReady,
  checkActionWith,
  decideActionWith,
  decisionFromStatus,
  missingDatabaseStop,
  pollActionWith,
  type ActionGateRecord,
  type ActionGateStore,
} from "./action-gate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = Date.parse("2026-10-02T00:00:00.000Z");

function memoryStore(opts?: { entitled?: boolean }): ActionGateStore & { rows: ActionGateRecord[]; audits: string[] } {
  const rows: ActionGateRecord[] = [];
  const audits: string[] = [];
  const store: ActionGateStore & { rows: ActionGateRecord[]; audits: string[] } = {
    rows,
    audits,
    async entitled() {
      return opts?.entitled !== false;
    },
    async insert(row) {
      rows.push({ ...row });
    },
    async getById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async listOpen(_userId, now) {
      return rows.filter((row) => row.status === "hold" && new Date(row.expiresAt).getTime() > now);
    },
    async save(row) {
      const i = rows.findIndex((item) => item.id === row.id);
      if (i >= 0) rows[i] = { ...row };
    },
    async markExpired(id, nowIso) {
      const row = rows.find((item) => item.id === id);
      if (!row || row.status !== "hold") return null;
      if (new Date(row.expiresAt).getTime() > Date.parse(nowIso)) return null;
      row.status = "expired";
      row.decidedAt = nowIso;
      row.channel = "timeout";
      return { ...row };
    },
    async audit(event) {
      audits.push(`${event.action} ${event.detail}`);
    },
  };
  return store;
}

const agent = { id: "agt_1", userId: "usr_1", name: "Support", paused: false };
const body = {
  action_type: "email.send",
  summary: "Send the refund reply",
  preview: "Hi — your refund is on the way.",
  target: "customer@example.com",
  risk: "high",
};

describe("Action Gate decisions", () => {
  it("maps allow to go, hold to wait, and block or timeout to stop", () => {
    assert.equal(decisionFromStatus("allow"), "go");
    assert.equal(decisionFromStatus("hold"), "wait");
    assert.equal(decisionFromStatus("block"), "stop");
    assert.equal(decisionFromStatus("expired"), "stop");
    assert.equal(missingDatabaseStop().decision, "stop");
    assert.equal(missingDatabaseStop().must_abort, true);
    assert.match(missingDatabaseStop().reasons[0] ?? "", /DATABASE_URL/);
    assert.equal(actionGateDatabaseReady({}), false);
    assert.equal(actionGateDatabaseReady({ DATABASE_URL: "  " }), false);
    assert.equal(actionGateDatabaseReady({ DATABASE_URL: "postgres://example" }), true);
  });

  it("returns wait, then go or stop, and stop on timeout", async () => {
    const store = memoryStore();
    const opened = await checkActionWith({
      databaseReady: true,
      now: NOW,
      apiKey: "key_1",
      body,
      agent,
      store,
      newId: () => "appr_1",
    });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.equal(opened.result.decision, "wait");
    assert.equal(opened.result.must_abort, true);
    assert.equal(opened.result.approval_id, "appr_1");
    assert.equal(opened.result.expires_in_s, HOLD_TTL_MS / 1000);
    assert.match(store.audits[0] ?? "", /action_wait/);
    assert.match(store.audits[0] ?? "", /channel=request/);

    const waiting = await pollActionWith({
      now: NOW + 1000,
      agentId: agent.id,
      approvalId: "appr_1",
      store,
      agentName: agent.name,
    });
    assert.equal(waiting?.decision, "wait");

    const allowed = await decideActionWith({
      now: NOW + 2000,
      userId: agent.userId,
      approvalId: "appr_1",
      decision: "allow",
      store,
    });
    assert.equal(allowed.ok, true);
    const go = await pollActionWith({
      now: NOW + 3000,
      agentId: agent.id,
      approvalId: "appr_1",
      store,
    });
    assert.equal(go?.decision, "go");
    assert.equal(go?.must_abort, false);
    assert.match(store.audits.join("\n"), /action_go/);
    assert.match(store.audits.join("\n"), /channel=inbox/);
    assert.match(store.audits.join("\n"), /who=usr_1/);

    const blockedStore = memoryStore();
    await checkActionWith({
      databaseReady: true,
      now: NOW,
      apiKey: "key_1",
      body: { ...body, action_type: "slack.post", target: "#support" },
      agent,
      store: blockedStore,
      newId: () => "appr_2",
    });
    const blocked = await decideActionWith({
      now: NOW + 1000,
      userId: agent.userId,
      approvalId: "appr_2",
      decision: "block",
      store: blockedStore,
    });
    assert.equal(blocked.ok, true);
    const stop = await pollActionWith({
      now: NOW + 2000,
      agentId: agent.id,
      approvalId: "appr_2",
      store: blockedStore,
    });
    assert.equal(stop?.decision, "stop");
    assert.equal(stop?.must_abort, true);

    const expiredStore = memoryStore();
    await checkActionWith({
      databaseReady: true,
      now: NOW,
      apiKey: "key_1",
      body: { ...body, action_type: "crm.write", target: "deal_8841" },
      agent,
      store: expiredStore,
      newId: () => "appr_3",
    });
    const timedOut = await pollActionWith({
      now: NOW + HOLD_TTL_MS + 1,
      agentId: agent.id,
      approvalId: "appr_3",
      store: expiredStore,
    });
    assert.equal(timedOut?.decision, "stop");
    assert.match(expiredStore.audits.join("\n"), /channel=timeout/);
    assert.match(expiredStore.audits.join("\n"), /who=timeout/);
  });

  it("stops when the plan is locked or the database is missing", async () => {
    const locked = await checkActionWith({
      databaseReady: true,
      now: NOW,
      apiKey: "key_1",
      body,
      agent,
      store: memoryStore({ entitled: false }),
      newId: () => "nope",
    });
    assert.equal(locked.ok, true);
    if (!locked.ok) return;
    assert.equal(locked.result.decision, "stop");
    assert.equal(locked.result.approval_id, null);
    assert.equal(locked.result.pay_url, ACTION_GATE_HREF);
    assert.match(locked.result.reasons[0] ?? "", /\$49/);
    assert.match(locked.result.reasons[0] ?? "", new RegExp(ACTION_GATE_PAY_ABSOLUTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(ACTION_GATE_PAY_ABSOLUTE, "https://agent-control.net/billing/pay?plan=action");
    assert.doesNotMatch(locked.result.reasons.join(" "), /\$29|plan=starter|Starter/);

    const missing = await checkActionWith({
      databaseReady: false,
      now: NOW,
      apiKey: "key_1",
      body,
      agent,
      store: memoryStore(),
      newId: () => "nope",
    });
    assert.equal(missing.ok, true);
    if (!missing.ok) return;
    assert.equal(missing.status, 503);
    assert.equal(missing.result.decision, "stop");
    assert.match(missing.result.reasons[0] ?? "", new RegExp(ACTION_GATE_DB_ENV));
    assert.match(ACTION_GATE_DB_ERROR, /0022_action_gate/);
  });

  it("rejects a body that cannot be decided", async () => {
    const bad = await checkActionWith({
      databaseReady: true,
      now: NOW,
      apiKey: "key_1",
      body: { action_type: "", summary: "", preview: "" },
      agent,
      store: memoryStore(),
      newId: () => "nope",
    });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.equal(bad.status, 400);
  });
});

describe("Action Gate billing and audit", () => {
  it("unlocks plan=action at $49 without replacing a Human plan", () => {
    assert.equal(parsePayPlan("action"), "action");
    assert.equal(parsePayPlan("ACTION"), "action");
    assert.equal(parsePayPlan("nope"), "starter");
    assert.equal(payPlanQuote("action").price, ACTION_GATE_PRICE_USD);
    assert.equal(payPlanQuote("action").price, 49);
    assert.equal(humanInboxPlan("action"), null);
    assert.equal(humanInboxPlan("starter"), "starter");
    assert.equal(ACTION_GATE_HREF, "/billing/pay?plan=action");

    const view = viewInvoice(
      {
        id: "inv_action",
        plan: "action",
        recipient: "SomeOtherWallet111111111111111111111111",
        reference: "Ref111111111111111111111111111111111111111",
        status: "pending",
        expires_at: new Date(NOW + 30 * 60 * 1000).toISOString(),
      },
      "https://example.test",
    );
    assert.equal(view.plan, "action");
    assert.equal(view.amount_usdc, 49);
    assert.equal(view.recipient, SOLANA_PAYOUT_ADDRESS);
    assert.match(view.copy.title, /Action Gate/);
    assert.doesNotMatch(view.copy.title, /Console stays on/);
  });

  it("puts action decisions on the existing audit trail", () => {
    const detail = actionAuditDetail({
      verdict: "stop",
      actionType: "email.send",
      target: "customer@example.com",
      channel: "inbox",
      who: "usr_1",
    });
    const rows = buildAuditTrail({
      chain: "solana",
      transactions: [],
      alerts: [],
      decisions: [
        {
          created_at: "2026-10-02T00:05:00.000Z",
          action: "action_stop",
          detail,
        },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, "decision");
    assert.equal(rows[0]?.result, "action_stop");
    assert.match(rows[0]?.detail ?? "", /email.send/);
    assert.match(rows[0]?.detail ?? "", /channel=inbox/);
    assert.match(rows[0]?.detail ?? "", /who=usr_1/);
  });

  it("documents curl, MCP, and the Neon schema", () => {
    assert.match(ACTION_GATE_CURL_EMAIL, /email\.send/);
    assert.match(ACTION_GATE_CURL_SLACK, /slack\.post/);
    assert.match(ACTION_GATE_CURL_CRM, /crm\.write/);
    assert.match(ACTION_GATE_CURL_EMAIL, /\/api\/v1\/check_action/);
    assert.match(ACTION_GATE_MCP_NOTE, /check_action/);
    assert.match(ACTION_GATE_MCP_NOTE, /ask_human/);
    assert.equal(ACTION_GATE_DB_ENV, "DATABASE_URL");
    assert.equal(ACTION_GATE_SCHEMA, "migrations/0022_action_gate.sql");
    const sql = readFileSync(join(ROOT, ACTION_GATE_SCHEMA), "utf8");
    assert.match(sql, /create table if not exists action_approvals/);
    assert.match(sql, /create table if not exists action_entitlements/);
    const db = readFileSync(join(ROOT, "src/lib/db.ts"), "utf8");
    assert.match(db, /applyNeonMigrations/);
    assert.match(db, /DATABASE_URL/);
    const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
    assert.match(docs, /id="action-gate"/);
    assert.match(docs, /ACTION_GATE_CURL_EMAIL/);
    assert.match(docs, /ACTION_GATE_CURL_SLACK/);
    assert.match(docs, /ACTION_GATE_CURL_CRM/);
    assert.match(docs, /ACTION_GATE_STOP_EXAMPLE/);
    assert.match(docs, /ACTION_GATE_EMAIL_NOTE/);
    assert.match(docs, /ACTION_GATE_PAY_CTA/);
    assert.match(ACTION_GATE_STOP_EXAMPLE, /Slack/);
    assert.match(ACTION_GATE_STOP_EXAMPLE, /CRM/);
    assert.match(ACTION_GATE_EMAIL_NOTE, /Nothing is sent/);
    assert.equal(ACTION_GATE_PAY_CTA, "Pay $49");
    assert.doesNotMatch(ACTION_GATE_STOP_EXAMPLE, /\$29/);
    const connect = readFileSync(join(ROOT, "src/routes/connect.tsx"), "utf8");
    const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
    assert.match(connect, /ACTION_GATE_HREF/);
    assert.match(connect, /ACTION_GATE_PAY_CTA/);
    assert.match(connect, /ACTION_GATE_STOP_EXAMPLE/);
    const payAt = llms.indexOf("https://agent-control.net/billing/pay?plan=action");
    const starterAt = llms.indexOf("Then Starter $29");
    assert.ok(payAt >= 0 && starterAt > payAt);
    assert.match(llms, /Nothing goes out/);
    assert.match(llms, /Email send stops until email is connected/);
    assert.match(llms, /plan starter\|pro\|team\|action/);
  });
});
