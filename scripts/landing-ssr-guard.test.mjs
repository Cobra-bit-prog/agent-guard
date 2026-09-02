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
  const src = `${home}\n${modules}\n${preview}`;
  assert.match(src, /External audit for your agents — Agent Control/);
  assert.match(src, /External audit for your agents/);
  assert.doesNotMatch(src, /See every send before it happens/);
  assert.match(src, /Keep control of your agents/);
  assert.match(src, /Agent payments control/);
  assert.match(modules, /label: "Dashboard"/);
  assert.match(modules, /label: "Agent Audit"/);
  assert.match(modules, /label: "Approval Inbox"/);
  assert.match(
    modules,
    /\{ id: "dashboard", label: "Dashboard" \}[\s\S]*\{ id: "audit", label: "Agent Audit" \}[\s\S]*\{ id: "inbox", label: "Approval Inbox" \}/,
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
  const beforeDetails = docs.split("<details")[0] ?? docs;
  assert.doesNotMatch(beforeDetails, /curl /);
  assert.doesNotMatch(beforeDetails, /POST \/api\/v1\/check/);
  assert.doesNotMatch(docs, /Wire the hook/);
  assert.doesNotMatch(docs, /Sky Ledger\s*[×xX]\s*Operator/);
  assert.doesNotMatch(docs, /to=["']\/inbox["']|href=["']\/inbox["']/);
  assert.doesNotMatch(docs, /\bbroadcast/i);
});
