import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONNECT_AGENTKIT_CODE,
  CONNECT_BUILDERS_HEADING,
  CONNECT_CHECK_CODE,
  CONNECT_CHECK_PATH,
  CONNECT_FAQ_ANSWER,
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
  /poll_url/,
  /\bHOLD\b/,
  /POST \/api\/v1\/check/,
  /check_transfer/,
  /Connect AgentKit \/ x402/,
  /must abort/i,
  /\babort\b/i,
];

const CUSTOMER_BLOB = [
  CONNECT_HEADLINE,
  CONNECT_LEDE,
  CONNECT_STARTER_LINE,
  CONNECT_BUILDERS_HEADING,
  CONNECT_FAQ_ANSWER,
  ...CONNECT_STEPS.map((s) => `${s.t} ${s.d}`),
].join(" ");

describe("Connect your agent path", () => {
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
    assert.match(steps, /AgentKit/);
    assert.match(steps, /x402/);
    assert.match(steps, /MCP/);
    assert.match(CONNECT_AGENTKIT_CODE, /createAgentKitPolicyProvider/);
    assert.match(CONNECT_X402_CODE, /createX402BeforePaymentHook/);
    assert.match(CONNECT_CHECK_CODE, /agent-control\.net\/api\/v1\/check/);
    assert.doesNotMatch(steps, /\/api\/v2\//);
    assert.doesNotMatch(CONNECT_CHECK_CODE, /\/api\/v2\//);
  });

  it("stays in plain conversion copy", () => {
    assert.equal(CONNECT_HEADLINE, "Connect your agent");
    assert.equal(CONNECT_LEDE, "They ask before they pay. You keep the keys.");
    assert.match(CUSTOMER_BLOB, /Connect your agent/);
    assert.match(CUSTOMER_BLOB, /They ask before they pay/);
    assert.match(CUSTOMER_BLOB, /You keep the keys/);
    assert.match(CUSTOMER_BLOB, /External audit for your agents/);
    assert.match(CUSTOMER_BLOB, /Pay \$29/);
    assert.match(CUSTOMER_BLOB, /1-day trial/);
    assert.match(CUSTOMER_BLOB, /No card/);
    assert.match(CUSTOMER_BLOB, /No KYC/);
    assert.match(CUSTOMER_BLOB, /popular agent payment tools/);
    assert.doesNotMatch(CUSTOMER_BLOB, /Checks before they pay/);
    assert.doesNotMatch(CUSTOMER_BLOB, /check before they pay/i);
    assert.doesNotMatch(CUSTOMER_BLOB, /checked before they pay/);
    for (const re of BANNED) {
      assert.doesNotMatch(CUSTOMER_BLOB, re);
    }
  });

  it("landing, /connect, and docs all show both CTAs and the same check", () => {
    const home = read("src/routes/index.tsx");
    const connect = read("src/routes/connect.tsx");
    const docs = read("src/routes/docs.tsx");
    const faq = read("src/components/landing-faq.tsx");
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
    assert.match(connect, /ConnectSteps/);
    assert.match(connect, /CONNECT_BUILDERS_HEADING/);
    assert.match(connect, /CONNECT_CHECK_CODE/);
    assert.doesNotMatch(connect, /About three minutes/);
    assert.doesNotMatch(connect, /Call the same check/);
    assert.doesNotMatch(connect, /Connect AgentKit \/ x402/);

    assert.match(docs, /id=["']connect-agentkit["']/);
    assert.match(docs, /href=["']#connect-agentkit["']/);
    assert.match(docs, /ConnectCtas/);
    assert.match(docs, /href=["']\/connect["']/);
    assert.doesNotMatch(docs, /Connect AgentKit \/ x402/);

    assert.match(chrome, /href: "\/connect"/);
    assert.match(sitemap, /https:\/\/agent-control\.net\/connect/);
    assert.match(llms, /https:\/\/agent-control\.net\/connect/);

    assert.match(faq, /CONNECT_FAQ_ANSWER/);
    assert.doesNotMatch(faq, /poll_url/);
    assert.doesNotMatch(faq, /\bHOLD\b/);
    assert.doesNotMatch(home, /poll_url/);
    assert.doesNotMatch(home, /About three minutes/);
    assert.doesNotMatch(home, /Full AgentKit \/ x402 steps/);
    assert.doesNotMatch(home, /Checks before they pay/);
    assert.doesNotMatch(home, /checked before they pay/);
    assert.doesNotMatch(home, /checks before they pay/);
    assert.doesNotMatch(faq, /checked before they pay/);
    assert.doesNotMatch(connect, /Checks before they pay/);

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
