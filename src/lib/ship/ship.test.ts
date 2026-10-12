import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  getHireOrder,
  hashHireIp,
  insertHireOrder,
  parseHireIntake,
  type HireQuery,
} from "../hire/orders.ts";
import { handleShipRequest } from "./handle.ts";
import { customerShipMail, supportShipMail, type ShipMail } from "./notify.ts";
import { parseShipIntake, submitShipOrder } from "./orders.ts";
import {
  SHIP_CHARGE_LINE,
  SHIP_HONESTY_LINE,
  SHIP_PACKAGES,
  SHIP_REFUND_LINE,
  SHIP_REPLY_LINE,
  SHIP_SUPPORT_EMAIL,
} from "./packages.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0029_hire_orders.sql"), "utf8");
const NOW = new Date("2026-10-12T15:00:00.000Z");

const JARGON = /escrow|money hold|hold funds|holding funds|10% cut|\b10%|\bSKU\b/i;

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

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
    package: "fix",
    endpoint: "https://example.com/pay",
    email: "ada@example.com",
    note: "The 402 body is missing a field.",
    ...overrides,
  };
}

function post(body: unknown, ip = "203.0.113.50") {
  return new Request("https://agent-control.net/api/v1/ship", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("ship packages", () => {
  it("keeps Fix at $149 and Launch at $399", () => {
    assert.deepEqual(
      SHIP_PACKAGES.map((pack) => [pack.id, pack.name, pack.priceUsd, pack.days]),
      [
        ["fix", "Fix", 149, 3],
        ["launch", "Launch", 399, 5],
      ],
    );
    const fix = SHIP_PACKAGES[0];
    const launch = SHIP_PACKAGES[1];
    assert.match(fix?.included ?? "", /valid 402/);
    assert.match(fix?.included ?? "", /Coinbase's x402 validator/);
    assert.match(fix?.included ?? "", /listed so it can be discovered/);
    assert.match(fix?.included ?? "", /3 business days/);
    assert.match(
      launch?.included ?? "",
      /one API or tool live as a paid x402 endpoint, with a listing/,
    );
    assert.match(launch?.included ?? "", /5 business days/);
    for (const pack of SHIP_PACKAGES) {
      assert.match(pack.excluded, /do not promise sales/i);
      assert.match(pack.excluded, /do not promise a listing by Coinbase/i);
      assert.doesNotMatch(
        `${pack.included}\n${pack.excluded}`,
        /Coinbase will list|more sales|new customers/i,
      );
      assert.doesNotMatch(`${pack.included}\n${pack.excluded}`, JARGON);
    }
  });
});

describe("ship intake", () => {
  it("accepts an endpoint, a package, an email, and an optional note", () => {
    const parsed = parseShipIntake(intake());
    assert.equal(parsed.package_id, "fix");
    assert.equal(parsed.email, "ada@example.com");
    assert.equal(parsed.endpoint, "https://example.com/pay");
    assert.equal(parsed.note, "The 402 body is missing a field.");
    assert.equal(parseShipIntake(intake({ note: "  " })).note, "");
    assert.equal(parseShipIntake(intake({ note: undefined })).note, "");
  });

  it("rejects a bad endpoint, a bad email, the wrong package, and the honeypot", () => {
    assert.throws(() => parseShipIntake(intake({ endpoint: "  " })), /Endpoint URL is required/);
    assert.throws(() => parseShipIntake(intake({ endpoint: "http://example.com/pay" })), /https/);
    assert.throws(() => parseShipIntake(intake({ email: "not-an-email" })), /real email/);
    assert.throws(() => parseShipIntake(intake({ package: "directory_boost" })), /Pick a package/);
    assert.throws(() => parseShipIntake(intake({ package: "nope" })), /Pick a package/);
    assert.throws(
      () =>
        parseHireIntake({
          ...intake(),
          name: "Ada",
          brief: "A brief",
          link: "https://example.com",
        }),
      /Pick a package/,
    );
    assert.throws(
      () => parseShipIntake(intake({ company_website: "https://spam.example" })),
      /Could not send this request/,
    );
  });

  it("saves a request on hire_orders and does not charge", async () => {
    const sql = await openDb();
    const sent: ShipMail[] = [];
    const result = await submitShipOrder({
      sql,
      body: intake({ package: "launch" }),
      now: NOW,
      ipHash: hashHireIp("203.0.113.50"),
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    assert.equal(result.mode, "request");
    assert.equal(result.package_name, "Launch");
    assert.equal(result.amount_usd, 399);
    assert.equal("url" in result, false);
    assert.equal(sent.length, 2);
    assert.equal(sent[0]?.to, SHIP_SUPPORT_EMAIL);
    assert.match(sent[0]?.text ?? "", /not paid yet/);
    assert.match(sent[0]?.text ?? "", /https:\/\/example.com\/pay/);
    assert.match(sent[0]?.text ?? "", /The 402 body is missing a field/);
    assert.equal(sent[1]?.to, "ada@example.com");
    assert.match(sent[1]?.text ?? "", new RegExp(SHIP_CHARGE_LINE.replace(/[.]/g, "\\.")));
    assert.match(sent[1]?.text ?? "", new RegExp(SHIP_REPLY_LINE.replace(/[.]/g, "\\.")));
    assert.match(sent[1]?.text ?? "", new RegExp(SHIP_REFUND_LINE.replace(/[.]/g, "\\.")));
    assert.match(sent[1]?.text ?? "", new RegExp(SHIP_HONESTY_LINE.replace(/[.]/g, "\\.")));
    for (const mail of sent) assert.doesNotMatch(`${mail.subject}\n${mail.text}`, JARGON);

    const rows = await sql.query<{
      status: string;
      package_id: string;
      package_name: string;
      amount_usd: number | string;
      name: string;
      email: string;
      brief: string;
      link: string | null;
      stripe_session_id: string | null;
    }>(
      `select status, package_id, package_name, amount_usd, name, email, brief, link, stripe_session_id
       from hire_orders where id = $1`,
      [result.id],
    );
    const row = rows[0];
    assert.equal(row?.status, "requested");
    assert.equal(row?.package_id, "launch");
    assert.equal(row?.package_name, "Launch");
    assert.equal(Number(row?.amount_usd), 399);
    assert.equal(row?.name, "ada@example.com");
    assert.equal(row?.email, "ada@example.com");
    assert.equal(row?.brief, "The 402 body is missing a field.");
    assert.equal(row?.link, "https://example.com/pay");
    assert.equal(row?.stripe_session_id, null);

    const stored = await getHireOrder(sql, result.id);
    assert.equal(stored?.package_id, "launch");
    assert.equal(stored?.link, "https://example.com/pay");
  });

  it("writes an empty note when the field is left blank", async () => {
    const sql = await openDb();
    const sent: ShipMail[] = [];
    const result = await submitShipOrder({
      sql,
      body: intake({ note: "" }),
      now: NOW,
      ipHash: hashHireIp("203.0.113.51"),
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
    assert.match(sent[0]?.text ?? "", /\(none\)/);
    const stored = await getHireOrder(sql, result.id);
    assert.equal(stored?.brief, "");
  });

  it("shares the hire request limit for one network", async () => {
    const sql = await openDb();
    const ip = hashHireIp("203.0.113.52");
    for (let i = 0; i < 5; i += 1) {
      await insertHireOrder(
        sql,
        parseHireIntake({
          package: "directory_boost",
          name: "Ada",
          email: `ada${i}@example.com`,
          brief: "List it.",
        }),
        NOW,
        ip,
      );
    }
    await assert.rejects(
      () =>
        submitShipOrder({
          sql,
          body: intake(),
          now: NOW,
          ipHash: ip,
          sendMail: async () => undefined,
        }),
      (err: unknown) => err instanceof Error && "status" in err && err.status === 429,
    );
  });
});

describe("ship API", () => {
  it("lists both packages and saves a request without a payment URL", async () => {
    const catalog = await handleShipRequest(
      new Request("https://agent-control.net/api/v1/ship"),
      null,
      NOW,
    );
    assert.equal(catalog.status, 200);
    const listed = (await catalog.json()) as {
      request_only: boolean;
      charged_from_form: boolean;
      refund: string;
      packages: Array<{ id: string; price_usd: number }>;
    };
    assert.equal(listed.request_only, true);
    assert.equal(listed.charged_from_form, false);
    assert.equal(listed.refund, SHIP_REFUND_LINE);
    assert.deepEqual(
      listed.packages.map((pack) => [pack.id, pack.price_usd]),
      [
        ["fix", 149],
        ["launch", 399],
      ],
    );

    const sql = await openDb();
    const saved = await handleShipRequest(post(intake()), sql, NOW);
    assert.equal(saved.status, 201);
    const body = (await saved.json()) as {
      mode: string;
      package_name: string;
      amount_usd: number;
      url?: string;
    };
    assert.equal(body.mode, "request");
    assert.equal(body.package_name, "Fix");
    assert.equal(body.amount_usd, 149);
    assert.equal(body.url, undefined);

    const bad = await handleShipRequest(
      new Request("https://agent-control.net/api/v1/ship", { method: "POST", body: "{" }),
      sql,
      NOW,
    );
    assert.equal(bad.status, 400);

    const missing = await handleShipRequest(post(intake(), "203.0.113.53"), null, NOW);
    assert.equal(missing.status, 503);
  });
});

describe("ship page and discovery", () => {
  it("ships the form, the links, and the public offer", () => {
    const page = read("src/routes/ship.index.tsx");
    const layout = read("src/routes/ship.tsx");
    const thanks = read("src/routes/ship.thanks.tsx");
    const api = read("src/routes/api/v1/ship.ts");
    const home = read("src/routes/index.tsx");
    const hire = read("src/routes/hire.index.tsx");
    const x402 = read("src/routes/x402-check.tsx");
    const agent = read("src/routes/agent-check.tsx");
    const chrome = read("src/components/marketing/chrome.tsx");
    const faq = read("src/lib/faq-copy.ts");
    const sitemap = read("public/sitemap.xml");
    const robots = read("public/robots.txt");
    const llms = read("public/llms.txt");
    const skill = read("public/skill.md");
    const agents = read("public/agents.json");
    const wellKnown = read("public/.well-known/agents.json");
    const agentsTxt = read("public/agents.txt");
    const tree = read("src/routeTree.gen.ts");

    assert.match(layout, /createFileRoute\("\/ship"\)/);
    assert.match(page, /createFileRoute\("\/ship\/"\)/);
    assert.match(thanks, /createFileRoute\("\/ship\/thanks"\)/);
    assert.match(api, /createFileRoute\("\/api\/v1\/ship"\)/);
    assert.match(page, /name="endpoint"/);
    assert.match(page, /name="email"/);
    assert.match(page, /name="note"/);
    assert.match(page, /Optional/);
    assert.match(page, /fetch\("\/api\/v1\/ship"/);
    assert.match(page, /Send request/);
    assert.equal(SHIP_REFUND_LINE, "If the work isn't delivered, we refund in USDC.");
    assert.match(page, /\{SHIP_REFUND_LINE\}/);
    assert.match(page, /\{SHIP_CHARGE_LINE\}/);
    assert.match(page, /\{SHIP_REPLY_LINE\}/);
    assert.match(page, /\{SHIP_HONESTY_LINE\}/);
    assert.match(thanks, /\{SHIP_REFUND_LINE\}/);
    assert.match(thanks, /Nothing is charged/);
    assert.doesNotMatch(page, /stripe|Pay \$|mode: "checkout"/i);
    const packages = read("src/lib/ship/packages.ts");
    const shipLlms = llms.slice(
      llms.indexOf("## Ship to paid"),
      llms.indexOf("## Agent directory"),
    );
    const shipSkill = skill.slice(skill.indexOf("## 8. Ship to paid"));
    const shipCopy = [page, thanks, packages, shipLlms, shipSkill].join("\n");
    assert.doesNotMatch(shipCopy, JARGON);
    assert.match(packages, /do not promise sales/i);
    assert.match(packages, /do not promise a listing by Coinbase/i);
    assert.match(shipLlms, /do not promise sales/i);
    assert.match(shipSkill, /do not promise sales/i);
    assert.doesNotMatch(shipCopy, /Coinbase will list you/i);

    assert.match(home, /Find an agent\. Get the job done\./);
    assert.doesNotMatch(home, /href="\/ship"/);
    assert.match(hire, /href="\/ship"/);
    assert.match(hire, /Ship to paid/);
    assert.match(agent, /href="\/ship"/);
    assert.match(faq, /href: "\/ship"/);
    assert.match(chrome, /href="\/ship"/);
    assert.match(chrome, /Ship to paid/);
    assert.equal((x402.match(/href="\/ship"/g) ?? []).length, 1);
    assert.match(x402, /function ShipFailLink/);
    assert.match(x402, /if \(!show\) return null/);
    assert.match(x402, /checkFailed\(free\.failed, free\.checks\)/);
    assert.match(x402, /checkFailed\(invoice\?\.report\?\.failed, reportChecks\)/);

    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/ship<\/loc>/);
    assert.match(robots, /Allow: \/ship/);
    assert.match(robots, /Disallow: \/api\/v1\/ship/);
    assert.match(llms, /https:\/\/agent-control\.net\/ship/);
    assert.match(llms, /Fix — \$149/);
    assert.match(llms, /Launch — \$399/);
    assert.match(llms, new RegExp(SHIP_REFUND_LINE));
    assert.match(skill, /## 8\. Ship to paid/);
    assert.match(skill, /Fix — \$149/);
    assert.match(skill, /Launch — \$399/);
    assert.equal(agents, wellKnown);
    assert.match(agents, /https:\/\/agent-control\.net\/ship/);
    assert.match(agents, /Fix \$149, Launch \$399/);
    assert.match(agentsTxt, /Fix \$149, Launch \$399/);
    assert.match(tree, /'\/ship'/);
    assert.match(tree, /'\/api\/v1\/ship'/);
  });
});

describe("ship mail copy", () => {
  it("tells the customer the form did not charge them", () => {
    const order = {
      id: "ship_x",
      package_name: "Fix",
      amount_usd: 149,
      email: "ada@example.com",
      endpoint: "https://example.com/pay",
      note: "",
    };
    const customer = customerShipMail(order);
    const support = supportShipMail(order);
    assert.match(customer.text, /Nothing is charged from this form/);
    assert.match(customer.text, /USDC payment link/);
    assert.match(customer.text, /If the work isn't delivered, we refund in USDC/);
    assert.match(support.text, /not paid yet/);
    assert.match(support.text, /\(none\)/);
    assert.doesNotMatch(`${customer.text}\n${support.text}`, JARGON);
    assert.doesNotMatch(`${customer.text}\n${support.text}`, /Card checkout/);
  });
});
