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
    join(ROOT, "src/routes/connect.tsx"),
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

test("homepage copy ships three product tabs and 24-hour trial truth", () => {
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const modules = readFileSync(join(ROOT, "src/components/marketing/landing-modules.tsx"), "utf8");
  const preview = readFileSync(join(ROOT, "src/components/marketing/landing-preview.tsx"), "utf8");
  const verdict = readFileSync(join(ROOT, "src/components/marketing/landing-verdict.tsx"), "utf8");
  const catchDemo = readFileSync(join(ROOT, "src/components/marketing/landing-catch.tsx"), "utf8");
  const gate = readFileSync(join(ROOT, "src/components/marketing/landing-gate.tsx"), "utf8");
  const src = `${home}\n${modules}\n${preview}\n${verdict}\n${catchDemo}\n${gate}`;
  assert.match(src, /External audit for your agents — Agent Control/);
  assert.match(src, /External audit for your agents/);
  assert.match(src, /Not a package scanner — this is spend control for agent wallets\./);
  assert.doesNotMatch(src, /See every send before it happens/);
  assert.match(src, /Keep control of your agents/);
  assert.match(src, /Agent payments control/);
  assert.match(modules, /label: "Dashboard"/);
  assert.match(modules, /label: "Agent Audit"/);
  assert.match(modules, /label: "Approval Inbox"/);
  assert.doesNotMatch(modules, /label: "Partners"/);
  assert.doesNotMatch(modules, /id: "partners"/);
  assert.match(
    modules,
    /\{ id: "dashboard", label: "Dashboard" \}[\s\S]*\{ id: "audit", label: "Agent Audit" \}[\s\S]*\{ id: "inbox", label: "Approval Inbox" \}/,
  );
  assert.doesNotMatch(modules, /\{ id: "partners", label: "Partners" \}/);
  assert.match(src, /Approval Inbox/);
  assert.match(src, /Agent Audit/);
  assert.match(src, /Requires the agent hook/);
  assert.match(src, /Allow once/);
  assert.match(src, /Always allow/);
  assert.match(src, /10-minute hold/);
  assert.match(src, /Download Excel/);
  assert.match(src, /Download PDF/);
  assert.match(src, /Download CSV/);
  assert.match(src, /on-demand/);
  assert.match(src, /External audit for your agents — you keep the keys\./);
  assert.match(src, /Connect your agent/);
  assert.match(
    src,
    /Give it an API key\. They ask before they pay\. You keep the keys\./,
  );
  assert.doesNotMatch(src, /Before it sends money/);
  assert.doesNotMatch(src, /If the answer is no, it must not send/);
  assert.match(src, /Held by you · They ask before they pay/);
  assert.doesNotMatch(src, /Checks before they pay/);
  assert.doesNotMatch(src, /checked before they pay/);
  assert.doesNotMatch(src, /Check before every send/);
  assert.match(src, /Outside policy = stop/);
  assert.match(src, /Warning alerts are optional/);
  assert.match(src, /suspicious or\s+over-limit\s+activity/);
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
  assert.doesNotMatch(src, /\bmagnet\b/i);
  assert.doesNotMatch(src, /\bwired\b/i);
  assert.doesNotMatch(src, /\blookup\b/i);
  assert.doesNotMatch(src, /locked sample/i);
  assert.doesNotMatch(src, /sandbox JSON/i);
  assert.match(src, /Paste the wallet\. See what would not have left\./);
  assert.match(src, /Example week from a research agent — or paste yours\. Read-only\. We never hold the keys\./);
  assert.match(src, /Open an example/);
  assert.match(src, /2 fine, 1 would wait, 1 would stop\. \$9,100 would not have left\./);
  assert.match(src, /Example week · research agent/);
  assert.match(src, /A new address waits on you\./);
  assert.match(
    src,
    /The agent wants to pay\. You have not seen this address\. Money does not leave until you\s+tap\./,
  );
  assert.match(src, /Example only\. No real money moves\./);
  assert.match(src, /See the \$2,400 one/);
  assert.match(src, /Take money only from agents under a spend limit\./);
  assert.doesNotMatch(src, /have a leash|agent is leashed/);
  assert.match(
    src,
    /You keep your own checkout\. We only answer: is this agent capped, and does a human see\s+new addresses\?/,
  );
  assert.match(
    src,
    /Pays only if the agent is capped\. You keep the keys\. Agent Control checks the cap before\s+we take USDC\./,
  );
  assert.match(home, /limit how fast they can spend/);
  assert.doesNotMatch(home, /hourly velocity/);
  assert.doesNotMatch(src, /\/api\/v1\/verify/);
  assert.match(
    home,
    /LandingVerdict[\s\S]*LandingProductTabs[\s\S]*LandingCatch[\s\S]*id="how"[\s\S]*id="connect"[\s\S]*id="pricing"[\s\S]*LandingGate[\s\S]*LandingFaq/,
  );
});

test("marketing sky theme uses darker navy muted copy for contrast", () => {
  const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");
  const sky = css.match(/\.sky\s*\{[\s\S]*?\n {2}\}/)?.[0] ?? "";
  assert.match(sky, /--color-muted:\s*#3a4d63/);
  assert.match(sky, /--color-subtle:\s*#4a5d73/);
  assert.doesNotMatch(sky, /--color-muted:\s*#5b6b80/);
  assert.doesNotMatch(sky, /--color-subtle:\s*#8a96a8/);
});

test("homepage FAQ covers Inbox, Audit, hold vs block, and skipped-check limits", () => {
  const faq = readFileSync(join(ROOT, "src/components/landing-faq.tsx"), "utf8");
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const copy = readFileSync(join(ROOT, "src/lib/connect-path.ts"), "utf8");
  const src = `${faq}\n${home}`;
  assert.match(src, /How do I connect my agent\?/);
  assert.match(src, /What if the agent skips the check\?/);
  assert.match(src, /What is Approval Inbox\?/);
  assert.match(src, /What is Agent Audit\?/);
  assert.match(src, /Is this a package scanner\?/);
  assert.match(src, /spend control for agent wallets/);
  assert.doesNotMatch(src, /agentaudit/i);
  assert.doesNotMatch(src, /spendguard/i);
  assert.doesNotMatch(src, /agentspay/i);
  assert.match(src, /Do you email me when something looks off\?/);
  assert.match(src, /Email alerts is on in Settings/);
  assert.match(src, /near the daily cap/);
  assert.match(src, /incoming webhook URL/);
  assert.match(src, /No action within 10 minutes/);
  assert.match(src, /must abort/);
  assert.match(faq, /CONNECT_FAQ_ANSWER/);
  assert.match(copy, /If we say stop, it does not send/);
  assert.doesNotMatch(src, /must_abort/);
  assert.doesNotMatch(src, /poll_url/);
  assert.doesNotMatch(src, /\bHOLD\b/);
  assert.doesNotMatch(src, /POST \/api\/v1\/check/);
  assert.match(src, /always allow that address/);
  assert.match(src, /No action for 10 minutes = block/);
  assert.match(src, /Pause and blocklists stop the send right away/);
  assert.match(src, /Over-limit or new addresses wait for you; block means do not send/);
  assert.doesNotMatch(src, /Hold waits for you/);
  assert.doesNotMatch(src, /a hold waiting in Inbox/);
  assert.doesNotMatch(src, /When a spend is held/);
  assert.match(src, /a payment waiting in Approval Inbox/);
  assert.match(src, /When a payment is waiting for you/);
  assert.match(src, /Inbox cannot stop that send/);
  assert.match(src, /Connect your agent/);
  assert.match(src, /You keep the keys/);
  assert.match(src, /\/audit/);
  assert.match(src, /auto-emailed/);
  assert.match(src, /a replay of every on-chain transfer/);
  assert.doesNotMatch(src, /ghost replay/);
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
    /Give it an API key\. They ask before they pay\. You keep the keys\./,
  );
  assert.doesNotMatch(docs, /Before it sends money/);
  assert.doesNotMatch(docs, /If the answer is no, it must not send/);
  assert.match(docs, /Watch the console/);
  assert.match(docs, /ConnectCtas/);
  assert.match(docs, /Start free trial|ConnectCtas/);
  assert.match(docs, /SupportedChains/);
  assert.match(docs, /<details/);
  assert.match(docs, /For builders/);
  assert.match(docs, /1-day \(24 hour\)/);
  assert.match(docs, /cannot stop\s+that send/);
  assert.match(docs, /Allow once/);
  assert.match(docs, /Always allow this\s+address/);
  assert.match(docs, /on-demand Excel, PDF, or CSV/);
  assert.match(docs, /New or over-limit payments wait in Approval Inbox/);
  assert.match(docs, /Agent Audit/);
  assert.match(docs, /a replay of every on-chain\s+transfer/);
  assert.doesNotMatch(docs.split("<details")[0] ?? docs, /ghost replay/);
  assert.match(docs, /Nothing is\s+auto-emailed/);
  assert.match(docs, /Optional warning alerts/);
  assert.match(docs, /Email alerts/);
  const beforeDetails = docs.split("<details")[0] ?? docs;
  assert.doesNotMatch(beforeDetails, /curl /);
  assert.doesNotMatch(beforeDetails, /must_abort/);
  assert.match(docs, /If the check says stop, do not send/);
  assert.match(docs, /<code className="font-mono text-fg">must_abort<\/code>/);
  assert.match(docs, /id=["']connect-your-agent["']/);
  assert.match(docs, /id=["']connect-agentkit["']/);
  assert.match(docs, /href=["']#connect-agentkit["']/);
  assert.match(docs, /href=["']\/connect["']/);
  assert.match(docs, /id=["']compare["']/);
  assert.match(docs, /id=["']skill-mcp["']/);
  assert.match(docs, /href=["']\/llms\.txt["']/);
  assert.match(docs, /asks Agent Control before it sends money/);
  assert.match(docs, /The agent asks Agent Control first/);
  assert.doesNotMatch(docs.split("<details")[0] ?? docs, /The agent POSTs \/api\/v1\/check/);
  assert.match(docs, /Over-limit and new addresses wait in Approval Inbox/);
  assert.doesNotMatch(docs, /HOLD in Approval Inbox \(hold vs block\)/);
  assert.doesNotMatch(docs, /check before spend for agent wallets/);
  assert.doesNotMatch(docs, /Connect AgentKit \/ x402/);
  assert.match(docs, /POST \/api\/v1\/check/);
  assert.match(docs, /check_transfer/);
  assert.match(docs, /get_approval/);
  assert.match(docs, /get_agent_status/);
  assert.match(docs, /id=["']agent-storefront["']/);
  assert.match(docs, /href=["']#agent-storefront["']/);
  assert.match(docs, /get_pricing/);
  assert.match(docs, /start_trial/);
  assert.match(docs, /attach_human/);
  assert.match(docs, /create_checkout/);
  assert.match(docs, /get_status/);
  assert.match(docs, /POST \/api\/v1\/billing\/checkout/);
  assert.match(docs, /GET \/api\/v1\/storefront\/pricing/);
  assert.match(
    docs,
    /A human principal signs up and owns billing and Approval Inbox; agents connect\s+under that account/,
  );
  assert.match(docs, /themName: "a package scanner"/);
  assert.match(docs, /themName: "a firewall you run yourself"/);
  assert.match(docs, /themName: "a wallet or key host"/);
  assert.match(docs, /firewall you run on your own machine/);
  assert.match(docs, /Hosted Approval Inbox and Agent Audit/);
  assert.match(docs, /You can use both/);
  assert.doesNotMatch(docs, /agentaudit/i);
  assert.doesNotMatch(docs, /spendguard/i);
  assert.doesNotMatch(docs, /agentspay/i);
  assert.match(docs, /Coinbase AgentKit/);
  assert.match(docs, /id=["']agentkit["']/);
  assert.match(docs, /id=["']adapters["']/);
  assert.match(docs, /href=["']#adapters["']/);
  assert.match(docs, /id=["']policy-recipe["']/);
  assert.match(docs, /id=["']hold-notifications["']/);
  assert.match(docs, /Drop-in helpers so you do not write fetch yourself/);
  assert.match(docs, /Wait is a hold/);
  assert.match(docs, /createAgentKitPolicyProvider/);
  assert.match(docs, /createX402BeforePaymentHook/);
  assert.match(docs, /src\/adapters/);
  assert.match(docs, /Over the line/);
  assert.match(docs, /Daily cap \+ approval threshold/);
  assert.match(docs, /themName: "a control plane or cards"/);
  assert.match(docs, /control plane or cards/);
  assert.match(docs, /You can use both/);
  assert.match(docs, /No extra vendor|No\s+extra vendor/);
  assert.match(docs, /partners\?partner=agentkit/);
  assert.match(beforeDetails, /fetch\("https:\/\/agent-control\.net\/api\/v1\/check"/);
  assert.match(docs, /themName: "a wallet or key host"/);
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
  assert.match(llms, /They ask before they pay/);
  assert.match(llms, /Over-limit \/ new addresses wait for you/);
  assert.match(llms, /Approval Inbox/);
  assert.match(llms, /Agent Audit/);
  assert.match(llms, /https:\/\/agent-control\.net\/docs/);
  assert.match(llms, /https:\/\/agent-control\.net\/connect/);
  assert.match(llms, /https:\/\/agent-control\.net\/inbox/);
  assert.match(llms, /https:\/\/agent-control\.net\/audit/);
  assert.match(llms, /POST \/api\/v1\/check/);
  assert.match(llms, /If the check says stop, do not send/);
  assert.doesNotMatch(llms, /must_abort/);
  assert.doesNotMatch(llms, /\bHOLD\b/);
  assert.match(llms, /MCP get_approval/);
  assert.match(llms, /A package scanner/);
  assert.match(llms, /they scan code packages/);
  assert.match(llms, /firewall you run on your own machine/);
  assert.match(llms, /control plane or cards/);
  assert.match(llms, /A wallet or key host/);
  assert.doesNotMatch(llms, /agentaudit/i);
  assert.doesNotMatch(llms, /SpendGuard/);
  assert.doesNotMatch(llms, /x402-spendguard/);
  assert.doesNotMatch(llms, /Agentspay/);
  assert.doesNotMatch(llms, /\bZoro\b/);
  assert.doesNotMatch(llms, /\bLocus\b/);
  assert.doesNotMatch(llms, /turnkey/i);
  assert.doesNotMatch(llms, /privy/i);
  assert.match(llms, /Not a package scanner/);
  assert.match(llms, /Coinbase AgentKit/);
  assert.match(llms, /src\/adapters/);
  assert.match(llms, /docs#adapters/);
  assert.match(llms, /docs#connect-agentkit/);
  assert.match(llms, /docs#policy-recipe/);
  assert.match(llms, /createAgentKitPolicyProvider/);
  assert.match(llms, /Check API \(machine-readable\)/);
  const checkApiBlock = llms.match(/Check API \(machine-readable\):\n([\s\S]*?)\n## /)?.[1] ?? "";
  const llmsWithoutCheckApi = llms.replace(/Check API \(machine-readable\):\n[\s\S]*?\n## /, "## ");
  assert.match(checkApiBlock, /poll_url/);
  assert.match(checkApiBlock, /approval_id/);
  assert.doesNotMatch(llmsWithoutCheckApi, /poll_url/);
  assert.doesNotMatch(llmsWithoutCheckApi, /approval_id/);
  assert.match(llms, /Excel, PDF, or CSV|Excel\/PDF\/CSV/);
  assert.doesNotMatch(llms, /Turnkey \/ Privy/);
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
  assert.match(llms, /## Agent Storefront/);
  assert.match(llms, /GET \/api\/v1\/storefront\/pricing/);
  assert.match(llms, /POST \/api\/v1\/storefront\/trial/);
  assert.match(llms, /POST \/api\/v1\/billing\/checkout/);
  assert.match(llms, /GET \/api\/v1\/storefront\/status/);
  assert.match(llms, /get_pricing/);
  assert.match(llms, /start_trial/);
  assert.match(llms, /attach_human/);
  assert.match(llms, /create_checkout/);
  assert.match(llms, /get_status/);
  assert.match(llms, /docs#agent-storefront/);
  assert.match(llms, /Agents cannot open a root account/);
  assert.match(llms, /cannot decide Approval Inbox/);
  assert.doesNotMatch(llms, /\bbroadcast/i);
});

test("FAQ and Compare drop competitor names; homepage H1 stays External audit for your agents", () => {
  const faq = readFileSync(join(ROOT, "src/components/landing-faq.tsx"), "utf8");
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
  const compare = docs.split('id="compare"')[1]?.split('id="partners"')[0] ?? "";
  const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
  const surfaces = `${faq}\n${home}\n${compare}\n${llms}`;
  assert.match(faq, /Is this a package scanner\?/);
  assert.match(faq, /Do you host this, or do I run it myself\?/);
  assert.match(faq, /They ask before they pay/);
  assert.match(faq, /Within policy = auto · Outside policy = stop/);
  assert.doesNotMatch(faq, /checked before they pay/);
  assert.doesNotMatch(home, /Checks before they pay/);
  assert.doesNotMatch(home, /checked before they pay/);
  assert.doesNotMatch(home, /checks before they pay/);
  assert.match(home, /They ask before they pay/);
  assert.match(home, /Do you host this, or do I run it myself\?/);
  assert.match(home, /<h1[^>]*>\s*External audit for your agents\s*<\/h1>/);
  assert.match(
    home,
    /<h1[^>]*>\s*External audit for your agents\s*<\/h1>\s*<p[^>]*>\s*Not a package scanner — this is spend control for agent wallets\.\s*<\/p>/,
  );
  assert.doesNotMatch(surfaces, /agentaudit/i);
  assert.doesNotMatch(surfaces, /spendguard/i);
  assert.doesNotMatch(surfaces, /agentspay/i);
  assert.doesNotMatch(faq, /turnkey/i);
  assert.doesNotMatch(compare, /turnkey/i);
  assert.doesNotMatch(home, /turnkey/i);
  assert.doesNotMatch(home, /Policy \+ pre-sign/i);
  assert.doesNotMatch(home, /Policy \+ check before they pay/);
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
  assert.match(partners, /Ask before every send/);
  assert.match(partners, /Before the agent pays, send the destination and dollar amount/);
  assert.match(partners, /Waiting payments/);
  assert.match(partners, /New or over-limit payments wait in Approval Inbox/);
  assert.match(partners, /then have it ask Agent Control first/);
  assert.match(partners, /If the check says stop, do not send/);
  assert.doesNotMatch(partners, /must_abort/);
  assert.doesNotMatch(partners, /poll_url/);
  assert.doesNotMatch(partners, /\bHOLD\b/);
  assert.doesNotMatch(partners, /POST \/api\/v1\/check/);
  assert.doesNotMatch(partners, /value_usd/);
  assert.doesNotMatch(partners, /Hold poll/);
  assert.match(partners, /\$29 \/ Pro \$49 \/ Team \$149 USDC/);
  assert.match(partners, /support@agent-control\.net/);
  assert.match(partners, /\/docs#connect-your-agent/);
  assert.match(partners, /\/docs#adapters/);
  assert.match(partners, /\/docs#policy-recipe/);
  assert.match(partners, /\/docs#compare/);
  assert.match(partners, /\?partner=/);
  assert.match(partners, /login\?partner=turnkey/);
  assert.match(partners, /signup\?partner=agentkit/);
  assert.match(partners, /External audit for your agents — you keep the keys\./);
  assert.match(partners, /signupHref/);
  assert.doesNotMatch(partners, /\bbroadcast/i);
  assert.doesNotMatch(partners, /to=["']\/inbox["']|href=["']\/inbox["']/);
  assert.doesNotMatch(partners, /href=["']\/audit["']/);
  assert.match(docs, /href=["']\/partners["']/);
  assert.match(docs, /id=["']partners["']/);
  assert.match(sitemap, /https:\/\/agent-control\.net\/partners/);
  assert.match(chrome, /href: "\/partners"/);
  assert.match(chrome, /href: "\/connect"/);
  assert.match(chrome, /partnerAwarePath/);
  assert.match(partners, /partnerAwarePath/);
});

test("Connect your agent path is trial then Pay $29 on the same check", () => {
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const connect = readFileSync(join(ROOT, "src/routes/connect.tsx"), "utf8");
  const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
  const ctas = readFileSync(join(ROOT, "src/components/marketing/connect-path.tsx"), "utf8");
  const copy = readFileSync(join(ROOT, "src/lib/connect-path.ts"), "utf8");
  const sitemap = readFileSync(join(ROOT, "public/sitemap.xml"), "utf8");
  const src = `${home}\n${connect}\n${docs}\n${ctas}\n${copy}`;
  assert.match(home, /id=["']connect["']/);
  assert.match(home, /href=["']\/connect["']/);
  assert.match(connect, /createFileRoute\("\/connect"\)/);
  assert.match(docs, /id=["']connect-agentkit["']/);
  assert.match(copy, /CONNECT_TRIAL_HREF = "\/signup"/);
  assert.match(copy, /CONNECT_PAY_HREF = "\/billing\/pay\?plan=starter"/);
  assert.match(copy, /CONNECT_TRIAL_CTA = "Start free trial"/);
  assert.match(copy, /CONNECT_PAY_CTA = "Pay \$29"/);
  assert.match(copy, /\/api\/v1\/check/);
  assert.match(copy, /check_transfer/);
  assert.match(src, /ConnectCtas/);
  assert.match(src, /They ask before they pay/);
  assert.match(src, /You keep the keys/);
  assert.match(src, /External audit for your agents/);
  assert.match(copy, /Connect your agent/);
  assert.doesNotMatch(copy, /Connect AgentKit \/ x402/);
  assert.doesNotMatch(connect, /About three minutes/);
  assert.doesNotMatch(connect, /Call the same check/);
  assert.doesNotMatch(copy, /poll_url/);
  assert.doesNotMatch(copy, /\bHOLD\b/);
  assert.match(sitemap, /https:\/\/agent-control\.net\/connect/);
  assert.doesNotMatch(copy, /\bpre-sign hook\b/i);
  assert.doesNotMatch(connect, /\bpre-sign hook\b/i);
  assert.doesNotMatch(src, /\bHelius\b/);
  assert.doesNotMatch(src, /skipped check = money cannot move/i);
  assert.doesNotMatch(copy, /\/api\/v2\//);
});
