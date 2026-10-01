import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOLD_TTL_MS } from "./hold.ts";
import { PLANS } from "./plans.ts";
import { SOLANA_PAYOUT_ADDRESS } from "./pay-invoice.ts";
import {
  METER_ADDRESSES_100,
  METER_LOOK,
  METER_LOOKS_20,
  METER_PAID_SKU,
  METER_STAMP_TX,
} from "./meter/pricing.ts";
import { getPricing } from "./storefront.ts";
import { isActionGatePlan, parsePayPlan, payPlanQuote } from "./shop-shield.ts";
import {
  ACTION_GATE_HREF,
  ACTION_GATE_PLAN,
  checkActionWith,
  decideActionWith,
  pollActionWith,
  type ActionGateRecord,
  type ActionGateStore,
} from "./action-gate.ts";
import { crmForwardBody, deliverWrite, emailReady } from "./write-gate-forward.ts";
import {
  WRITE_GATE_BILLING_LINE,
  WRITE_GATE_CRM_CONNECT,
  WRITE_GATE_EMAIL_CONNECT,
  WRITE_GATE_POLL,
  WRITE_GATE_SLACK_CONNECT,
  WRITE_GATE_TOOLS,
  runWriteGate,
  type ApprovedWrite,
  type WriteConnections,
  type WriteForwardJob,
  type WriteToolName,
} from "./write-gate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = Date.parse("2026-10-02T00:00:00.000Z");
const agent = { id: "agt_1", userId: "usr_1", name: "Support", paused: false };

function memoryStore(opts?: { entitled?: boolean }): ActionGateStore & { rows: ActionGateRecord[] } {
  const rows: ActionGateRecord[] = [];
  const store: ActionGateStore & { rows: ActionGateRecord[] } = {
    rows,
    async entitled() {
      return opts?.entitled !== false;
    },
    async insert(row) {
      rows.push({ ...row });
    },
    async getById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async listOpen(userId, now) {
      return rows.filter(
        (row) => row.userId === userId && row.status === "hold" && new Date(row.expiresAt).getTime() > now,
      );
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
    async audit() {},
  };
  return store;
}

function approved(row: ActionGateRecord): ApprovedWrite {
  return {
    id: row.id,
    actionType: row.actionType,
    summary: row.summary,
    preview: row.preview,
    target: row.target,
  };
}

function connected(): WriteConnections {
  return {
    slackWebhookUrl: "https://hooks.slack.com/services/T/B/X",
    crmWebhookUrl: "https://crm.example/hooks/write",
    agentmailInboxId: "support@mail.example",
    emailReady: true,
  };
}

function harness(opts?: { entitled?: boolean; databaseReady?: boolean; connections?: WriteConnections }) {
  const store = memoryStore({ entitled: opts?.entitled });
  const databaseReady = opts?.databaseReady !== false;
  const calls: WriteForwardJob[] = [];
  let seq = 0;
  const claimed = new Set<string>();
  const connections = opts?.connections ?? connected();
  const run = (tool: WriteToolName, args: Record<string, unknown>, now = NOW) =>
    runWriteGate({
      tool,
      args,
      open: (body) =>
        checkActionWith({
          databaseReady,
          now,
          apiKey: "key_1",
          body,
          agent,
          store,
          newId: () => `appr_${++seq}`,
        }),
      poll: async (approvalId) => {
        const result = await pollActionWith({
          now,
          agentId: agent.id,
          approvalId,
          store,
          agentName: agent.name,
        });
        if (!result) return { ok: false, status: 404, error: "Unknown approval." };
        return { ok: true, status: 200, result };
      },
      readApproved: async (approvalId) => {
        const row = await store.getById(approvalId);
        return row ? approved(row) : null;
      },
      connections: async () => connections,
      claim: async (approvalId) => {
        if (claimed.has(approvalId)) return false;
        claimed.add(approvalId);
        return true;
      },
      release: async (approvalId) => {
        claimed.delete(approvalId);
      },
      deliver: async (job) => {
        calls.push(job);
        return { ok: true, destination: job.tool === "email.send" ? "email" : job.tool === "slack.post" ? "slack" : "crm" };
      },
    });
  return { store, calls, claimed, run };
}

const emailArgs = {
  to: "customer@example.com",
  subject: "Refund reply",
  text: "Hi — your refund is on the way.",
};

describe("Write Gate enforce", () => {
  it("stops when the seat is unpaid and does not forward", async () => {
    const { calls, run } = harness({ entitled: false });
    const result = await run("email.send", emailArgs);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.decision, "stop");
    assert.equal(result.result.must_abort, true);
    assert.equal(result.result.forwarded, false);
    assert.equal(result.result.approval_id, null);
    assert.equal(result.result.pay_url, ACTION_GATE_HREF);
    assert.equal(calls.length, 0);
  });

  it("stops when DATABASE_URL is missing and does not forward", async () => {
    const { calls, run } = harness({ databaseReady: false });
    const result = await run("slack.post", { text: "We are investigating." });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status, 503);
    assert.equal(result.result.decision, "stop");
    assert.equal(result.result.must_abort, true);
    assert.equal(result.result.forwarded, false);
    assert.match(result.result.reasons[0] ?? "", /DATABASE_URL/);
    assert.equal(calls.length, 0);
  });

  it("returns wait and the get_approval poll path without forwarding", async () => {
    const { calls, run, store } = harness();
    const opened = await run("crm.write", {
      summary: "Update the deal stage",
      preview: "Move Acme to Closed Won.",
      target: "deal_8841",
    });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.equal(opened.result.decision, "wait");
    assert.equal(opened.result.must_abort, true);
    assert.equal(opened.result.forwarded, false);
    assert.equal(opened.result.approval_id, "appr_1");
    assert.match(opened.result.reasons.join(" "), new RegExp(WRITE_GATE_POLL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(calls.length, 0);

    const still = await run("crm.write", { approval_id: "appr_1" }, NOW + 1000);
    assert.equal(still.ok, true);
    if (!still.ok) return;
    assert.equal(still.result.decision, "wait");
    assert.equal(still.result.forwarded, false);
    assert.equal(store.rows[0]?.status, "hold");
    assert.equal(calls.length, 0);
  });

  it("forwards once on go and does not forward again", async () => {
    const { calls, run, store } = harness();
    const opened = await run("email.send", emailArgs);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const id = opened.result.approval_id ?? "";
    const allowed = await decideActionWith({
      now: NOW + 1000,
      userId: agent.userId,
      approvalId: id,
      decision: "allow",
      store,
    });
    assert.equal(allowed.ok, true);

    const go = await run("email.send", { approval_id: id, text: "ignore this rewrite" }, NOW + 2000);
    assert.equal(go.ok, true);
    if (!go.ok) return;
    assert.equal(go.result.decision, "go");
    assert.equal(go.result.must_abort, false);
    assert.equal(go.result.forwarded, true);
    assert.equal(go.result.destination, "email");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.preview, emailArgs.text);
    assert.equal(calls[0]?.target, emailArgs.to);
    assert.equal(calls[0]?.summary, emailArgs.subject);

    const again = await run("email.send", { approval_id: id }, NOW + 3000);
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.result.decision, "go");
    assert.equal(again.result.already_forwarded, true);
    assert.equal(again.result.forwarded, true);
    assert.equal(calls.length, 1);
  });

  it("does not forward on stop", async () => {
    const { calls, run, store } = harness();
    const opened = await run("slack.post", { text: "Post the incident note", channel: "#support" });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const id = opened.result.approval_id ?? "";
    await decideActionWith({
      now: NOW + 1000,
      userId: agent.userId,
      approvalId: id,
      decision: "block",
      store,
    });
    const stop = await run("slack.post", { approval_id: id }, NOW + 2000);
    assert.equal(stop.ok, true);
    if (!stop.ok) return;
    assert.equal(stop.result.decision, "stop");
    assert.equal(stop.result.must_abort, true);
    assert.equal(stop.result.forwarded, false);
    assert.equal(calls.length, 0);
  });

  it("treats timeout as stop and does not forward", async () => {
    const { calls, run, store } = harness();
    const opened = await run("crm.write", { summary: "Update the deal", preview: "Closed Won", target: "deal_1" });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const id = opened.result.approval_id ?? "";
    const timed = await run("crm.write", { approval_id: id }, NOW + HOLD_TTL_MS + 1);
    assert.equal(timed.ok, true);
    if (!timed.ok) return;
    assert.equal(timed.result.decision, "stop");
    assert.equal(timed.result.must_abort, true);
    assert.equal(timed.result.forwarded, false);
    assert.equal(store.rows[0]?.status, "expired");
    assert.equal(store.rows[0]?.channel, "timeout");
    assert.equal(calls.length, 0);
  });

  it("stops instead of sending when email, Slack, or CRM is not connected", async () => {
    const { calls, run, store } = harness({
      connections: {
        slackWebhookUrl: "",
        crmWebhookUrl: "http://insecure.example/hook",
        agentmailInboxId: null,
        emailReady: false,
      },
    });
    const opened = await run("email.send", emailArgs);
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const id = opened.result.approval_id ?? "";
    await decideActionWith({
      now: NOW + 1000,
      userId: agent.userId,
      approvalId: id,
      decision: "allow",
      store,
    });
    const email = await run("email.send", { approval_id: id }, NOW + 2000);
    assert.equal(email.ok, true);
    if (!email.ok) return;
    assert.equal(email.result.decision, "stop");
    assert.equal(email.result.forwarded, false);
    assert.match(email.result.reasons[0] ?? "", new RegExp(WRITE_GATE_EMAIL_CONNECT));

    const slackOpen = await run("slack.post", { text: "hello" }, NOW + 3000);
    assert.equal(slackOpen.ok, true);
    if (!slackOpen.ok) return;
    const slackId = slackOpen.result.approval_id ?? "";
    await decideActionWith({
      now: NOW + 4000,
      userId: agent.userId,
      approvalId: slackId,
      decision: "allow",
      store,
    });
    const slack = await run("slack.post", { approval_id: slackId }, NOW + 5000);
    assert.equal(slack.ok, true);
    if (!slack.ok) return;
    assert.match(slack.result.reasons[0] ?? "", new RegExp(WRITE_GATE_SLACK_CONNECT));

    const crmOpen = await run("crm.write", { summary: "stage", preview: "won" }, NOW + 6000);
    assert.equal(crmOpen.ok, true);
    if (!crmOpen.ok) return;
    const crmId = crmOpen.result.approval_id ?? "";
    await decideActionWith({
      now: NOW + 7000,
      userId: agent.userId,
      approvalId: crmId,
      decision: "allow",
      store,
    });
    const crm = await run("crm.write", { approval_id: crmId }, NOW + 8000);
    assert.equal(crm.ok, true);
    if (!crm.ok) return;
    assert.match(crm.result.reasons[0] ?? "", new RegExp(WRITE_GATE_CRM_CONNECT));
    assert.equal(calls.length, 0);
  });
});

describe("Write Gate adapters", () => {
  it("posts the approved CRM preview once and sends mail only when Agentmail is connected", async () => {
    const job: WriteForwardJob = {
      tool: "crm.write",
      approvalId: "appr_9",
      summary: "Update the deal stage",
      preview: "Move Acme to Closed Won.",
      target: "deal_8841",
      connections: connected(),
    };
    const seen: Array<{ url: string; body: string; auth: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      seen.push({
        url: String(input),
        body: String(init?.body ?? ""),
        auth: new Headers(init?.headers).get("authorization"),
      });
      return new Response("ok", { status: 200 });
    };
    const crm = await deliverWrite(job, { fetch: fetchImpl, env: {} });
    assert.equal(crm.ok, true);
    if (!crm.ok) return;
    assert.equal(crm.destination, "crm");
    assert.equal(seen[0]?.url, "https://crm.example/hooks/write");
    assert.deepEqual(JSON.parse(seen[0]?.body ?? "{}"), crmForwardBody(job));
    assert.equal(seen[0]?.auth, null);

    const mail = await deliverWrite(
      { ...job, tool: "email.send", target: "customer@example.com", summary: "Refund reply", preview: "Hi" },
      { fetch: fetchImpl, env: { AGENTMAIL_API_KEY: "am_test" } },
    );
    assert.equal(mail.ok, true);
    assert.equal(seen[1]?.url, "https://api.agentmail.to/v0/inboxes/support%40mail.example/messages/send");
    assert.equal(seen[1]?.auth, "Bearer am_test");
    assert.deepEqual(JSON.parse(seen[1]?.body ?? "{}"), {
      to: ["customer@example.com"],
      subject: "Refund reply",
      text: "Hi",
    });

    const disconnected = await deliverWrite(
      { ...job, tool: "email.send", connections: { ...connected(), emailReady: false, agentmailInboxId: null } },
      { fetch: fetchImpl, env: {} },
    );
    assert.equal(disconnected.ok, false);
    assert.equal(seen.length, 2);
    assert.equal(emailReady(null, { AGENTMAIL_API_KEY: "am_test" }), false);
    assert.equal(emailReady("inbox", {}), false);
    assert.equal(emailReady("inbox", { AGENTMAIL_API_KEY: "am_test" }), true);
  });
});

describe("Write Gate pricing", () => {
  it("does not add a second SKU", () => {
    assert.deepEqual(WRITE_GATE_TOOLS, ["email.send", "slack.post", "crm.write"]);
    assert.equal(ACTION_GATE_PLAN, "action");
    assert.equal(parsePayPlan("write"), "starter");
    assert.equal(isActionGatePlan("write"), false);
    assert.equal(isActionGatePlan("action"), true);
    assert.equal(payPlanQuote("action").price, 49);
    assert.equal(payPlanQuote("write").name, "Starter");
    assert.deepEqual(Object.keys(PLANS), ["free", "starter", "pro", "team"]);
    const pricing = getPricing();
    assert.deepEqual(
      pricing.plans.map((plan) => plan.id),
      ["starter", "pro", "team"],
    );
    assert.equal(METER_PAID_SKU, "looks_20");
    assert.equal(METER_LOOK.price_usd, 0.1);
    assert.equal(METER_LOOKS_20.price_usd, 0.2);
    assert.equal(METER_ADDRESSES_100.price_usd, 0.15);
    assert.equal(METER_STAMP_TX.price_usd, 0.05);
    assert.equal(SOLANA_PAYOUT_ADDRESS.length > 20, true);

    const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
    const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
    const billing = readFileSync(join(ROOT, "src/routes/_app/billing.index.tsx"), "utf8");
    const connect = readFileSync(join(ROOT, "src/routes/connect.tsx"), "utf8");
    const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
    const inbox = readFileSync(join(ROOT, "src/routes/_app/inbox.tsx"), "utf8");
    const plans = readFileSync(join(ROOT, "src/lib/plans.ts"), "utf8");
    for (const src of [docs, llms, billing, connect, plans, home]) {
      assert.doesNotMatch(src, /plan=write/);
      assert.doesNotMatch(src, /plan:\s*["']write["']/);
    }
    assert.match(docs, /id="action-gate"/);
    assert.match(docs, /WRITE_GATE_ASK_VS_ENFORCE/);
    assert.match(llms, /Ask:/);
    assert.match(llms, /Enforce \(Write Gate\)/);
    assert.match(llms, /email\.send/);
    assert.match(billing, /WRITE_GATE_BILLING_LINE/);
    assert.match(connect, /WRITE_GATE_BILLING_LINE/);
    assert.match(WRITE_GATE_BILLING_LINE, /\$49/);
    assert.match(WRITE_GATE_BILLING_LINE, /plan=action/);
    assert.doesNotMatch(home, /Write Gate/);

    const actionBranch = inbox.slice(inbox.indexOf('it.kind === "action"'), inbox.indexOf(") : ("));
    assert.match(actionBranch, /Allow once/);
    assert.match(actionBranch, />\s*Block\s*</);
    assert.doesNotMatch(actionBranch, /Always allow/);
    assert.match(actionBranch, /action_type/);
  });
});
