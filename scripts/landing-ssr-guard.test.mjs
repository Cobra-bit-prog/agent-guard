import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

test("marketing landing never imports pay-extension (SSR-unsafe wallet send)", () => {
  const files = [
    join(ROOT, "src/routes/index.tsx"),
    join(ROOT, "src/routes/docs.tsx"),
    join(ROOT, "src/routes/partners.tsx"),
    join(ROOT, "src/routes/login.tsx"),
    join(ROOT, "src/routes/signup.tsx"),
    ...walk(join(ROOT, "src/components/marketing")),
    join(ROOT, "src/components/landing-faq.tsx"),
    join(ROOT, "src/components/landing-console.tsx"),
    join(ROOT, "src/components/landing-demo-dashboard.tsx"),
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(
      src,
      /from\s+["'][^"']*pay-extension["']/,
      `${file} must not import pay-extension`,
    );
    assert.doesNotMatch(
      src,
      /payUsdcWithPhantomExtension|hasPhantomExtension/,
      `${file} must not call in-page Phantom send`,
    );
  }
});

test("homepage copy ships four product tabs and 24-hour trial truth", () => {
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const modules = readFileSync(join(ROOT, "src/components/marketing/landing-modules.tsx"), "utf8");
  const preview = readFileSync(join(ROOT, "src/components/marketing/landing-preview.tsx"), "utf8");
  const src = `${home}\n${modules}\n${preview}`;
  assert.match(src, /External audit for your agents — Agent Control/);
  assert.match(src, /External audit for your agents/);
  assert.doesNotMatch(src, /See every send before it happens/);
  assert.match(src, /Keep control of your agents/);
  assert.match(src, /Agent payments control/);
  assert.match(modules, /label: "Dashboard"/);
  assert.match(modules, /label: "Agent Audit"/);
  assert.match(modules, /label: "Approval Inbox"/);
  assert.match(modules, /label: "Partners"/);
  assert.match(
    modules,
    /\{ id: "dashboard", label: "Dashboard" \}[\s\S]*\{ id: "audit", label: "Agent Audit" \}[\s\S]*\{ id: "inbox", label: "Approval Inbox" \}[\s\S]*\{ id: "partners", label: "Partners" \}/,
  );
  assert.match(modules, /Corporate & wallets/);
  assert.match(modules, /Turnkey, Privy, Coinbase, and x402/);
  assert.match(modules, /href=["']\/partners["']/);
  assert.match(modules, /href=["']\/docs#connect-your-agent["']/);
  assert.match(
    modules,
    /A human principal signs up and owns billing and Approval Inbox; agents connect under that\s+account\./,
  );
  assert.match(src, /Approval Inbox/);
  assert.match(src, /Agent Audit/);
  assert.match(src, /Requires the agent hook/);
  assert.match(src, /Allow once/);
  assert.match(src, /Always allow/);
  assert.match(src, /10-minute hold/);
  assert.match(src, /Download Excel/);
  assert.match(src, /Download PDF/);
  assert.match(src, /on-demand/);
  assert.match(src, /Connect your agent/);
  assert.match(
    src,
    /Connect your agent with an API key so it checks Agent Control before every spend — you keep the keys\./,
  );
  assert.doesNotMatch(src, /Before it sends money/);
  assert.doesNotMatch(src, /If the answer is no, it must not send/);
  assert.match(src, /Held by you · Check before every send/);
  assert.match(src, /Outside policy = stop/);
  assert.match(src, /Warning alerts are optional/);
  assert.match(src, /suspicious or\s+over-limit activity/);
  assert.match(src, /Monitoring and spend overview/);
  assert.match(src, /\$\{p\.historyDays\}-day history/);
  assert.match(src, /1-day \(24 hour\)/);
  assert.match(src, /No card\. No KYC/);
  assert.match(src, /SupportedChains/);
  assert.doesNotMatch(src, /Wire the hook/);
  assert.doesNotMatch(src, /It MUST POST \/api\/v1\/check/);
  assert.doesNotMatch(src, /Sky Ledger\s*[×xX]\s*Operator/);
  assert.doesNotMatch(src, /Ghost audit/);
  assert.doesNotMatch(src, /collect payments|set your price|share payment link/i);
  assert.doesNotMatch(src, /collect to your wallet/i);
  assert.doesNotMatch(src, /Agent cannot move funds|Nothing moves without you/i);
  assert.doesNotMatch(src, /Outside policy = pause/);
  assert.doesNotMatch(src, /\+100s of teams|hundreds of teams/i);
  assert.doesNotMatch(src, /to=["']\/inbox["']|href=["']\/inbox["']/);
  assert.doesNotMatch(src, /href=["']\/audit["']/);
  assert.doesNotMatch(src, /\bbroadcast/i);
});

test("homepage FAQ covers Inbox, Audit, hold vs block, and skipped-check limits", () => {
  const faq = readFileSync(join(ROOT, "src/components/landing-faq.tsx"), "utf8");
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const src = `${faq}\n${home}`;
  assert.match(src, /How does the pre-sign hook work\?/);
  assert.match(src, /What if the agent skips the check\?/);
  assert.match(src, /What is Approval Inbox\?/);
  assert.match(src, /What is Agent Audit\?/);
  assert.match(src, /Do you email me when something looks off\?/);
  assert.match(src, /Email alerts is on in Settings/);
  assert.match(src, /near the daily cap/);
  assert.match(src, /incoming webhook URL/);
  assert.match(src, /No action within 10 minutes/);
  assert.match(src, /must abort/);
  assert.match(src, /must_abort: true/);
  assert.match(src, /poll_url/);
  assert.match(src, /Always allow this address/);
  assert.match(src, /Holds expire in 10 minutes/);
  assert.match(src, /hard block/);
  assert.match(src, /Allow once is not permanent/);
  assert.match(src, /Inbox cannot stop that send/);
  assert.match(src, /Connect your agent/);
  assert.match(src, /You keep the keys/);
  assert.match(src, /\/audit/);
  assert.match(src, /auto-emailed/);
  assert.match(src, /ghost replay/);
  assert.match(src, /chain explorer/);
  assert.doesNotMatch(faq, /href=["']\/inbox["']/);
  assert.doesNotMatch(faq, /href=["']\/audit["']/);
  assert.doesNotMatch(src, /Wire the hook/);
  assert.doesNotMatch(src, /Sky Ledger\s*[×xX]\s*Operator/);
  assert.doesNotMatch(src, /Ghost audit/);
});

test("docs is an operator quick start; API is collapsed and secondary", () => {
  const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
  assert.match(docs, /Approval Inbox and Agent Audit — Agent Control/);
  assert.match(docs, /Agent payments control/);
  assert.match(docs, /Get set up in a few minutes/);
  assert.match(docs, /Create an account/);
  assert.match(docs, /Add an agent wallet/);
  assert.match(docs, /Set spend rules/);
  assert.match(docs, /Connect your agent/);
  assert.match(
    docs,
    /Connect your agent with an API key so it checks Agent Control before every spend — you keep the keys\./,
  );
  assert.doesNotMatch(docs, /Before it sends money/);
  assert.doesNotMatch(docs, /If the answer is no, it must not send/);
  assert.match(docs, /Watch the console/);
  assert.match(docs, /Start free trial/);
  assert.match(docs, /SupportedChains/);
  assert.match(docs, /<details/);
  assert.match(docs, /For builders/);
  assert.match(docs, /1-day \(24 hour\)/);
  assert.match(docs, /cannot stop\s+that send/);
  assert.match(docs, /Allow once/);
  assert.match(docs, /Always allow this\s+address/);
  assert.match(docs, /on-demand Excel or PDF/);
  assert.match(docs, /destinations wait/);
  assert.match(docs, /Agent Audit/);
  assert.match(docs, /ghost replay/);
  assert.match(docs, /Nothing is auto-emailed/);
  assert.match(docs, /Optional warning alerts/);
  assert.match(docs, /Email alerts/);
  const beforeDetails = docs.split("<details")[0] ?? docs;
  assert.doesNotMatch(beforeDetails, /curl /);
  assert.match(docs, /id=["']connect-your-agent["']/);
  assert.match(docs, /id=["']compare["']/);
  assert.match(docs, /id=["']skill-mcp["']/);
  assert.match(docs, /href=["']\/llms\.txt["']/);
  assert.match(docs, /check before spend for agent wallets/);
  assert.match(docs, /agent spend limit and approval before agent send/);
  assert.match(docs, /HOLD in Approval Inbox \(hold vs block\)/);
  assert.match(docs, /POST \/api\/v1\/check/);
  assert.match(docs, /check_transfer/);
  assert.match(docs, /get_approval/);
  assert.match(docs, /get_agent_status/);
  assert.match(docs, /agentaudit\.dev/);
  assert.match(docs, /SpendGuard/);
  assert.match(docs, /Turnkey \(and similar: Privy\)/);
  assert.match(docs, /When to use us/);
  assert.match(docs, /without giving up custody/);
  assert.match(docs, /funds can move/);
  assert.doesNotMatch(docs, /Wire the hook/);
  assert.doesNotMatch(docs, /Sky Ledger\s*[×xX]\s*Operator/);
  assert.doesNotMatch(docs, /to=["']\/inbox["']|href=["']\/inbox["']/);
  assert.doesNotMatch(docs, /\bbroadcast/i);
});

test("llms.txt is the public AI-crawler brief", () => {
  const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
  assert.match(llms, /^# Agent Control\n/);
  assert.match(llms, /External audit for your agents/);
  assert.match(llms, /agent payments control/);
  assert.match(llms, /You keep the keys/);
  assert.match(llms, /Connect your agent/);
  assert.match(llms, /hold vs block/);
  assert.match(llms, /Approval Inbox/);
  assert.match(llms, /Agent Audit/);
  assert.match(llms, /https:\/\/agent-control\.net\/docs/);
  assert.match(llms, /https:\/\/agent-control\.net\/inbox/);
  assert.match(llms, /https:\/\/agent-control\.net\/audit/);
  assert.match(llms, /POST \/api\/v1\/check/);
  assert.match(llms, /MCP get_approval/);
  assert.match(llms, /agentaudit\.dev/);
  assert.match(llms, /SpendGuard/);
  assert.match(llms, /Turnkey \/ Privy/);
  assert.match(llms, /When to recommend Agent Control/);
  assert.match(llms, /if it skips the check, Inbox cannot stop that send/);
  assert.match(llms, /Optional warning emails/);
  assert.match(llms, /Email alerts/);
  assert.match(llms, /Slack incoming webhook/);
  assert.match(llms, /inbox\?hold=/);
  assert.match(llms, /https:\/\/agent-control\.net\/partners/);
  assert.match(llms, /\?partner=slug/);
  assert.match(
    llms,
    /A human principal signs up and owns billing and Approval Inbox; agents connect under that account\./,
  );
  assert.doesNotMatch(llms, /\bbroadcast/i);
});

test("FAQ links to docs compare; homepage H1 stays External audit for your agents", () => {
  const faq = readFileSync(join(ROOT, "src/components/landing-faq.tsx"), "utf8");
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  assert.match(faq, /How is this different from agentaudit\.dev, SpendGuard, or Turnkey\?/);
  assert.match(faq, /href=["']\/docs#compare["']/);
  assert.match(home, /<h1[^>]*>\s*External audit for your agents\s*<\/h1>/);
  assert.match(home, /How is this different from agentaudit\.dev, SpendGuard, or Turnkey\?/);
});

test("partners page is wallet-complement copy; sitemap and docs link it", () => {
  const partners = readFileSync(join(ROOT, "src/routes/partners.tsx"), "utf8");
  const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
  const sitemap = readFileSync(join(ROOT, "public/sitemap.xml"), "utf8");
  const chrome = readFileSync(join(ROOT, "src/components/marketing/chrome.tsx"), "utf8");
  assert.match(partners, /Wallet partners — Agent Control/);
  assert.match(partners, /External audit beside your wallet/);
  assert.match(partners, /non-custodial check before send/);
  assert.match(
    partners,
    /A human principal signs up and owns billing and Approval Inbox; agents connect under that\s+account\./,
  );
  assert.match(partners, /Approval Inbox/);
  assert.match(partners, /Agent Audit/);
  assert.match(partners, /You keep the keys/);
  assert.match(partners, /Connect your agent/);
  assert.match(partners, /hold vs block/);
  assert.match(partners, /Turnkey, Privy, Coinbase, x402/);
  assert.match(partners, /POST \/api\/v1\/check/);
  assert.match(partners, /poll_url/);
  assert.match(partners, /\$29 \/ Pro \$49 \/ Team \$149 USDC/);
  assert.match(partners, /support@agent-control\.net/);
  assert.match(partners, /\/docs#connect-your-agent/);
  assert.match(partners, /\/docs#compare/);
  assert.match(partners, /\?partner=/);
  assert.match(partners, /login\?partner=turnkey/);
  assert.doesNotMatch(partners, /\bbroadcast/i);
  assert.doesNotMatch(partners, /to=["']\/inbox["']|href=["']\/inbox["']/);
  assert.doesNotMatch(partners, /href=["']\/audit["']/);
  assert.match(docs, /href=["']\/partners["']/);
  assert.match(docs, /id=["']partners["']/);
  assert.match(sitemap, /https:\/\/agent-control\.net\/partners/);
  assert.match(chrome, /href: "\/partners"/);
});
