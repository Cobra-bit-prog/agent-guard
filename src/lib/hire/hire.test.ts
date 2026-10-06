import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  CHECKOUT_SESSION_TOKEN,
  hireCheckoutFormBody,
  sessionMatchesOrder,
} from "./checkout.ts";
import { customerHireMail, supportHireMail, type HireMail } from "./notify.ts";
import {
  HireError,
  confirmHirePayment,
  hashHireIp,
  insertHireOrder,
  parseHireIntake,
  submitHireOrder,
  type HireQuery,
} from "./orders.ts";
import { HIRE_PACKAGES, HIRE_SUPPORT_EMAIL } from "./packages.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0029_hire_orders.sql"), "utf8");
const NOW = new Date("2026-10-06T15:00:00.000Z");

const BANNED = /escrow|refund|keep 10%|\b10%|\bSKU\b|\bMCP\b|\b402\b|LOCKED|hold funds|holding funds/i;

function wrap(db: PGlite): HireQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

async function openDb(): Promise<HireQuery> {
  const db = new PGlite();
  await db.exec(MIGRATION);
  return wrap(db);
}

function intake(overrides: Record<string, unknown> = {}) {
  return {
    package: "directory_boost",
    name: "Ada",
    email: "ada@example.com",
    brief: "List the research agent and write a plain offer.",
    link: "https://example.com/ada",
    ...overrides,
  };
}

describe("hire packages", () => {
  it("keeps the five public names and prices", () => {
    assert.deepEqual(
      HIRE_PACKAGES.map((pack) => [pack.name, pack.priceUsd]),
      [
        ["Agent directory boost", 49],
        ["Job pack (5 posts)", 79],
        ["Action Gate setup", 149],
        ["Outreach kit", 199],
        ["Done-for-you sprint (1 week)", 499],
      ],
    );
    const setup = HIRE_PACKAGES.find((pack) => pack.id === "action_gate_setup");
    assert.match(setup?.excluded ?? "", /\$49 a month/);
    assert.match(setup?.excluded ?? "", /separate subscription/);
    assert.match(setup?.excluded ?? "", /one-time setup/);
  });
});

describe("hire intake", () => {
  it("accepts a package, email, brief, and optional https link", () => {
    const parsed = parseHireIntake(intake());
    assert.equal(parsed.package_id, "directory_boost");
    assert.equal(parsed.email, "ada@example.com");
    assert.equal(parsed.link, "https://example.com/ada");
  });

  it("rejects a missing brief, a bad email, a non-https link, and the honeypot", () => {
    assert.throws(() => parseHireIntake(intake({ brief: "  " })), /Tell us what you need/);
    assert.throws(() => parseHireIntake(intake({ email: "not-an-email" })), /real email/);
    assert.throws(() => parseHireIntake(intake({ link: "http://example.com" })), /https/);
    assert.throws(() => parseHireIntake(intake({ package: "nope" })), /Pick a package/);
    assert.throws(
      () => parseHireIntake(intake({ company_website: "https://spam.example" })),
      (err: unknown) => err instanceof HireError && err.message === "Could not send this request.",
    );
  });

  it("saves a request and emails support when card checkout is off", async () => {
    const sql = await openDb();
    const sent: HireMail[] = [];
    const result = await submitHireOrder({
      sql,
      body: intake(),
      now: NOW,
      ipHash: hashHireIp("203.0.113.10"),
      card: false,
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok || result.mode !== "request") return;
    assert.equal(result.package_name, "Agent directory boost");
    assert.equal(result.amount_usd, 49);
    assert.equal(sent.length, 2);
    assert.equal(sent[0]?.to, HIRE_SUPPORT_EMAIL);
    assert.match(sent[0]?.text ?? "", /List the research agent/);
    assert.match(sent[0]?.text ?? "", /not paid yet/);
    assert.equal(sent[1]?.to, "ada@example.com");
    assert.match(sent[1]?.text ?? "", /1 business day/);
    assert.match(sent[1]?.text ?? "", /nothing has been charged/i);
    for (const mail of sent) assert.doesNotMatch(`${mail.subject}\n${mail.text}`, BANNED);
  });

  it("opens Stripe checkout with the package price and does not charge on failure", async () => {
    const body = hireCheckoutFormBody({
      orderId: "hire_abc",
      packageId: "job_pack",
      packageName: "Job pack (5 posts)",
      amountUsd: 79,
      email: "ada@example.com",
      origin: "https://agent-control.net",
    });
    assert.match(body, /unit_amount%5D=7900/);
    assert.match(body, /mode=payment/);
    assert.match(body, new RegExp(CHECKOUT_SESSION_TOKEN.replace(/[{}]/g, "\\$&")));
    assert.doesNotMatch(body, /%7BCHECKOUT_SESSION_ID%7D/);
    assert.doesNotMatch(body, /price=/);

    const sql = await openDb();
    const sent: HireMail[] = [];
    const opened = await submitHireOrder({
      sql,
      body: intake({ package: "job_pack" }),
      now: NOW,
      ipHash: hashHireIp("203.0.113.11"),
      card: true,
      startCheckout: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    assert.equal(opened.mode, "checkout");
    if (opened.mode !== "checkout") return;
    assert.equal(opened.url, "https://checkout.stripe.com/c/pay/cs_test_123");
    assert.equal(sent.length, 1);
    assert.match(sent[0]?.text ?? "", /not in yet/);
    assert.doesNotMatch(sent[0]?.text ?? "", /Our team can start/);

    const failed = await openDb();
    const fallback: HireMail[] = [];
    const saved = await submitHireOrder({
      sql: failed,
      body: intake(),
      now: NOW,
      ipHash: hashHireIp("203.0.113.12"),
      card: true,
      startCheckout: async () => {
        throw new Error("stripe down");
      },
      sendMail: async (mail) => {
        fallback.push(mail);
      },
    });
    assert.equal(saved.mode, "request");
    assert.equal(fallback.some((mail) => mail.to === HIRE_SUPPORT_EMAIL), true);
  });

  it("confirms a paid session once and ignores a second load", async () => {
    const sql = await openDb();
    const order = await insertHireOrder(sql, parseHireIntake(intake({ package: "sprint" })), NOW, hashHireIp("203.0.113.13"));
    const sent: HireMail[] = [];
    const session = {
      id: "cs_test_paid",
      payment_status: "paid",
      amount_total: 49900,
      currency: "usd",
      client_reference_id: order.id,
      metadata: { order_id: order.id },
    };
    assert.equal(sessionMatchesOrder(session, order), true);
    const paid = await confirmHirePayment({
      sql,
      session,
      now: NOW,
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    assert.equal(paid.status, "paid");
    assert.equal(paid.package_name, "Done-for-you sprint (1 week)");
    assert.equal(paid.amount_usd, 499);
    assert.equal(sent.filter((mail) => mail.to === HIRE_SUPPORT_EMAIL).length, 1);
    assert.match(sent.find((mail) => mail.to === "ada@example.com")?.text ?? "", /1 business day/);
    assert.match(supportHireMail(
      {
        id: order.id,
        package_name: order.package_name,
        amount_usd: order.amount_usd,
        name: order.name,
        email: order.email,
        brief: order.brief,
        link: order.link,
      },
      "paid",
    ).text, /Our team can start/);

    const again = await confirmHirePayment({
      sql,
      session,
      now: new Date(NOW.getTime() + 1000),
      sendMail: async () => {
        throw new Error("should not email twice");
      },
    });
    assert.equal(again.status, "paid");

    await assert.rejects(
      () =>
        confirmHirePayment({
          sql,
          session: { ...session, id: "cs_test_other", amount_total: 100 },
          now: NOW,
          sendMail: async () => undefined,
        }),
      /does not match|not complete/,
    );
  });

  it("limits repeated requests from one network", async () => {
    const sql = await openDb();
    const ip = hashHireIp("203.0.113.14");
    for (let i = 0; i < 5; i += 1) {
      await insertHireOrder(sql, parseHireIntake(intake({ email: `ada${i}@example.com` })), NOW, ip);
    }
    await assert.rejects(
      () => insertHireOrder(sql, parseHireIntake(intake()), NOW, ip),
      (err: unknown) => err instanceof HireError && err.status === 429,
    );
  });
});

describe("hire public copy", () => {
  it("ships the page, nav, and discovery without marketplace payment promises", () => {
    const page = readFileSync(join(ROOT, "src/routes/hire.index.tsx"), "utf8");
    const layout = readFileSync(join(ROOT, "src/routes/hire.tsx"), "utf8");
    const thanks = readFileSync(join(ROOT, "src/routes/hire.thanks.tsx"), "utf8");
    const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
    const chrome = readFileSync(join(ROOT, "src/components/marketing/chrome.tsx"), "utf8");
    const sitemap = readFileSync(join(ROOT, "public/sitemap.xml"), "utf8");
    const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
    const agents = readFileSync(join(ROOT, "public/agents.json"), "utf8");
    const wellKnown = readFileSync(join(ROOT, "public/.well-known/agents.json"), "utf8");
    const agentsTxt = readFileSync(join(ROOT, "public/agents.txt"), "utf8");
    const packages = readFileSync(join(ROOT, "src/lib/hire/packages.ts"), "utf8");
    const hireSection = llms.slice(llms.indexOf("## Hire us"), llms.indexOf("- Free job board"));
    const blob = [page, thanks, packages, hireSection].join("\n");

    assert.match(layout, /createFileRoute\("\/hire"\)/);
    assert.match(page, /createFileRoute\("\/hire\/"\)/);
    assert.match(thanks, /createFileRoute\("\/hire\/thanks"\)/);
    assert.match(page, /We'll reply within 1 business day/);
    assert.match(page, /This is not the free job board/);
    assert.match(home, /href="\/hire"/);
    assert.match(home, /Find an agent\. Get the job done\./);
    assert.match(page, /These packages pay us\s+directly/);
    assert.doesNotMatch(blob, /Pay only when|when the job is done|when you say/i);
    assert.match(chrome, /href: "\/hire", label: "Hire us"/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/hire<\/loc>/);
    assert.match(llms, /https:\/\/agent-control\.net\/hire/);
    assert.match(agentsTxt, /https:\/\/agent-control\.net\/hire/);
    assert.equal(agents, wellKnown);
    assert.match(agents, /https:\/\/agent-control\.net\/hire/);
    for (const pack of HIRE_PACKAGES) {
      assert.match(page, new RegExp(pack.name.replace(/[()]/g, "\\$&")));
      assert.match(llms, new RegExp(pack.name.replace(/[()]/g, "\\$&")));
    }
    assert.doesNotMatch(blob, BANNED);
    assert.doesNotMatch(customerHireMail(
      {
        id: "hire_x",
        package_name: "Agent directory boost",
        amount_usd: 49,
        name: "Ada",
        email: "ada@example.com",
        brief: "List it.",
        link: null,
      },
      "paid",
    ).text, BANNED);
  });
});
