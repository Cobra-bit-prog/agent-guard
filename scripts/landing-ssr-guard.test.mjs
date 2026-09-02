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

test("homepage copy ships Sky Operator modules and 24-hour trial truth", () => {
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
  const modules = readFileSync(join(ROOT, "src/components/marketing/landing-modules.tsx"), "utf8");
  const preview = readFileSync(join(ROOT, "src/components/marketing/landing-preview.tsx"), "utf8");
  const src = `${home}\n${modules}\n${preview}`;
  assert.match(src, /See every send before it happens/);
  assert.match(src, /Ghost audit/);
  assert.match(src, /Approval inbox/);
  assert.match(src, /On-chain pay/);
  assert.match(src, /Pay your plan in USDC, SOL, or ETH/);
  assert.match(src, /if the hook is wired/);
  assert.match(src, /Held by you · Check before every send/);
  assert.match(src, /Outside policy = stop/);
  assert.match(src, /\$\{p\.historyDays\}-day history/);
  assert.match(src, /1-day \(24 hour\)/);
  assert.match(src, /No card\. No KYC/);
  assert.doesNotMatch(src, /collect payments|set your price|share payment link/i);
  assert.doesNotMatch(src, /Agent cannot move funds|Nothing moves without you|set limits/i);
  assert.doesNotMatch(src, /Outside policy = pause/);
  assert.doesNotMatch(src, /\+100s of teams|hundreds of teams/i);
  assert.doesNotMatch(src, /to=["']\/inbox["']|href=["']\/inbox["']/);
});
