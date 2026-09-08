import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONNECT_AGENTKIT_CODE,
  CONNECT_CHECK_CODE,
  CONNECT_CHECK_PATH,
  CONNECT_HEADLINE,
  CONNECT_LEDE,
  CONNECT_MCP_TOOL,
  CONNECT_PATH,
  CONNECT_PAY_CTA,
  CONNECT_PAY_HREF,
  CONNECT_STARTER_LINE,
  CONNECT_STEPS,
  CONNECT_TRIAL_CTA,
  CONNECT_TRIAL_HREF,
  CONNECT_X402_CODE,
} from "./connect-path.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const BANNED = [
  /\bpre-sign hook\b/i,
  /\bbroadcast\b/i,
  /\bunique amount\b/i,
  /\bwatcher\b/i,
  /\bHelius\b/,
  /skipped check = money cannot move/i,
  /money cannot move/i,
];

describe("Connect AgentKit / x402 path", () => {
  it("locks trial and Pay $29 destinations", () => {
    assert.equal(CONNECT_PATH, "/connect");
    assert.equal(CONNECT_TRIAL_HREF, "/signup");
    assert.equal(CONNECT_PAY_HREF, "/billing/pay?plan=starter");
    assert.equal(CONNECT_TRIAL_CTA, "Start free trial");
    assert.equal(CONNECT_PAY_CTA, "Pay $29");
    assert.equal(CONNECT_CHECK_PATH, "/api/v1/check");
    assert.equal(CONNECT_MCP_TOOL, "check_transfer");
  });

  it("uses the existing check and adapters, not a second API", () => {
    const steps = CONNECT_STEPS.map((s) => `${s.t} ${s.d}`).join(" ");
    assert.match(steps, /POST \/api\/v1\/check/);
    assert.match(steps, /check_transfer/);
    assert.match(steps, /AgentKit \/ x402 adapter/);
    assert.match(CONNECT_AGENTKIT_CODE, /createAgentKitPolicyProvider/);
    assert.match(CONNECT_X402_CODE, /createX402BeforePaymentHook/);
    assert.match(CONNECT_CHECK_CODE, /agent-control\.net\/api\/v1\/check/);
    assert.doesNotMatch(steps, /\/api\/v2\//);
    assert.doesNotMatch(CONNECT_CHECK_CODE, /\/api\/v2\//);
  });

  it("stays in plain conversion copy", () => {
    const blob = [
      CONNECT_HEADLINE,
      CONNECT_LEDE,
      CONNECT_STARTER_LINE,
      ...CONNECT_STEPS.map((s) => `${s.t} ${s.d}`),
    ].join(" ");
    assert.match(blob, /Connect AgentKit \/ x402/);
    assert.match(blob, /They ask before they pay/);
    assert.match(blob, /You keep the keys/);
    assert.match(blob, /External audit for your agents/);
    assert.match(blob, /Pay \$29/);
    assert.match(blob, /1-day trial/);
    assert.match(blob, /No card/);
    assert.match(blob, /No KYC/);
    for (const re of BANNED) {
      assert.doesNotMatch(blob, re);
    }
  });

  it("landing, /connect, and docs all show both CTAs and the same check", () => {
    const home = read("src/routes/index.tsx");
    const connect = read("src/routes/connect.tsx");
    const docs = read("src/routes/docs.tsx");
    const chrome = read("src/components/marketing/chrome.tsx");
    const sitemap = read("public/sitemap.xml");
    const llms = read("public/llms.txt");

    assert.match(home, /id=["']connect["']/);
    assert.match(home, /href=["']\/connect["']/);
    assert.match(home, /ConnectCtas/);
    assert.match(
      home,
      /LandingVerdict[\s\S]*LandingProductTabs[\s\S]*LandingCatch[\s\S]*id="how"[\s\S]*id="connect"[\s\S]*id="pricing"[\s\S]*LandingGate[\s\S]*LandingFaq/,
    );

    assert.match(connect, /createFileRoute\("\/connect"\)/);
    assert.match(connect, /ConnectCtas/);
    assert.match(connect, /CONNECT_PAY_HREF|ConnectCtas/);
    assert.match(connect, /check_transfer|CONNECT_MCP_TOOL/);
    assert.match(connect, /\/api\/v1\/check|CONNECT_CHECK_PATH/);

    assert.match(docs, /id=["']connect-agentkit["']/);
    assert.match(docs, /href=["']#connect-agentkit["']/);
    assert.match(docs, /ConnectCtas/);
    assert.match(docs, /href=["']\/connect["']/);

    assert.match(chrome, /href: "\/connect"/);
    assert.match(sitemap, /https:\/\/agent-control\.net\/connect/);
    assert.match(llms, /https:\/\/agent-control\.net\/connect/);

    for (const src of [home, connect, docs]) {
      assert.match(src, /ConnectCtas/);
      assert.doesNotMatch(src, /\bpre-sign hook\b/i);
      assert.doesNotMatch(src, /\bbroadcast\b/i);
      assert.doesNotMatch(src, /\bwatcher\b/i);
      assert.doesNotMatch(src, /\bHelius\b/);
      assert.doesNotMatch(src, /skipped check = money cannot move/i);
    }
  });
});
