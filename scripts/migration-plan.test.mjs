import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  AGENT_LISTINGS_MIGRATION,
  EXCHANGE_JOBS_MIGRATION,
  HIRE_ORDERS_MIGRATION,
  agentListingsHoldNotice,
  agentListingsMigrationHeld,
  exchangeJobsHoldNotice,
  exchangeJobsMigrationHeld,
  hireOrdersHoldNotice,
  hireOrdersMigrationHeld,
  isMigrationFile,
  migrationName,
  pendingMigrations,
} from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const AUTH_MIGRATION = "0001_auth.sql";

/**
 * The auth-on copy of the Better Auth schema and its source, or null when the
 * app has not turned sign-in on (the shipped state).
 */
function authSchemaCopy(root) {
  const copy = join(root, "migrations", AUTH_MIGRATION);
  const source = join(root, "migrations/auth", AUTH_MIGRATION);
  if (!existsSync(copy) || !existsSync(source)) return null;
  return { copy: readFileSync(copy, "utf8"), source: readFileSync(source, "utf8") };
}

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied from another directory does not re-apply", () => {
  // The auth-on path copies migrations/auth/0001_auth.sql into the globbed
  // directory; a database that already has it must not run it twice.
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped (readdir also yields the auth/ directory)", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("the auth schema ships outside the globbed directory", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  const names = pendingMigrations(readdirSync(migrationsDir), [], {}).map((entry) => entry.name);
  assert.ok(names.includes("0024_write_gate.sql"));
  assert.equal(names.some((name) => name.includes("auth/")), false);
  assert.ok(readdirSync(join(migrationsDir, "auth")).includes("0001_auth.sql"));
});

test("this workspace's auth schema copy is byte-identical to its source", () => {
  // An edited copy diverges silently: basename keying skips it on a database
  // that already ran the original, and applies it on a fresh PGLite preview.
  const pair = authSchemaCopy(projectRoot());
  if (pair === null) return; // sign-in off — nothing has been copied up
  assert.equal(
    pair.copy,
    pair.source,
    "migrations/0001_auth.sql has been edited — it must stay a verbatim copy of migrations/auth/0001_auth.sql",
  );
});

test("the copy check reads both files and catches an edit", () => {
  const root = mkdtempSync(join(tmpdir(), "auth-schema-"));
  mkdirSync(join(root, "migrations/auth"), { recursive: true });
  writeFileSync(join(root, "migrations/auth", AUTH_MIGRATION), "create table t ();\n");
  assert.equal(authSchemaCopy(root), null);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t ();\n");
  const same = authSchemaCopy(root);
  assert.equal(same.copy, same.source);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t (x int);\n");
  const drifted = authSchemaCopy(root);
  assert.notEqual(drifted.copy, drifted.source);
});

test("exchange jobs migration applies in production and is skipped on preview", () => {
  const name = EXCHANGE_JOBS_MIGRATION;
  const sql = readFileSync(join(projectRoot(), "migrations", name), "utf8");
  assert.equal(existsSync(join(projectRoot(), "migrations", name)), true);
  assert.match(sql, /create table if not exists exchange_jobs/i);
  assert.match(sql, /contact text not null/);
  assert.match(sql, /hidden_at timestamptz/);
  assert.match(sql, /poster_ip_hash text/);
  assert.doesNotMatch(sql, /\b(alter|drop|insert|update|delete)\b/i);
  assert.doesNotMatch(sql, /pay_requests|meter_invoices|spend_audit_invoices/);
  assert.doesNotMatch(sql, /create trigger|create function|create or replace function/i);

  assert.equal(exchangeJobsMigrationHeld({}), false);
  assert.equal(exchangeJobsMigrationHeld({ VERCEL_ENV: "production" }), false);
  assert.equal(exchangeJobsMigrationHeld({ VERCEL_ENV: "preview" }), true);
  assert.equal(exchangeJobsHoldNotice({}), null);
  const notice = exchangeJobsHoldNotice({ VERCEL_ENV: "preview" });
  assert.match(notice ?? "", /production DATABASE_URL/);
  assert.match(notice ?? "", /not applied/);

  assert.deepEqual(pendingMigrations([name], [], { VERCEL_ENV: "production" }), [
    { name, path: name },
  ]);
  assert.deepEqual(pendingMigrations([name], [], {}), [{ name, path: name }]);
  assert.deepEqual(pendingMigrations([name], [], { VERCEL_ENV: "preview" }), []);

  const listed = readdirSync(join(projectRoot(), "migrations")).filter((entry) =>
    entry.endsWith(".sql"),
  );
  const preview = pendingMigrations(listed, [], { VERCEL_ENV: "preview" });
  assert.equal(
    preview.some((entry) => entry.name === name),
    false,
  );
  assert.equal(
    preview.some((entry) => entry.name === "0024_write_gate.sql"),
    true,
  );
  const production = pendingMigrations(listed, [], { VERCEL_ENV: "production" });
  assert.equal(
    production.some((entry) => entry.name === name),
    true,
  );

  const migrate = readFileSync(join(projectRoot(), "scripts/migrate.mjs"), "utf8");
  const db = readFileSync(join(projectRoot(), "src/lib/db.ts"), "utf8");
  assert.match(migrate, /pendingMigrations/);
  assert.match(migrate, /exchangeJobsHoldNotice/);
  assert.match(db, /pendingMigrations/);
  assert.match(db, /exchangeJobsHoldNotice/);
  assert.doesNotMatch(migrate, /EXCHANGE_JOBS_APPLY_MIGRATION/);
  assert.doesNotMatch(db, /EXCHANGE_JOBS_APPLY_MIGRATION/);
});

test("agent listings migration applies in production and is skipped on preview", () => {
  const name = AGENT_LISTINGS_MIGRATION;
  assert.equal(name, "0027_agent_listings.sql");
  const sql = readFileSync(join(projectRoot(), "migrations", name), "utf8");
  assert.equal(existsSync(join(projectRoot(), "migrations", name)), true);
  assert.match(sql, /create table if not exists agent_listings/i);
  assert.match(sql, /skills text\[\] not null/);
  assert.match(sql, /pitch text not null/);
  assert.match(sql, /contact text not null/);
  assert.match(sql, /link text/);
  assert.match(sql, /ip_hash text/);
  assert.match(sql, /hidden_at timestamptz/);
  assert.doesNotMatch(sql, /\b(alter|drop|insert|update|delete)\b/i);
  assert.doesNotMatch(sql, /pay_requests|meter_invoices|spend_audit_invoices|exchange_jobs/);
  assert.doesNotMatch(sql, /create trigger|create function|create or replace function/i);

  assert.equal(agentListingsMigrationHeld({}), false);
  assert.equal(agentListingsMigrationHeld({ VERCEL_ENV: "production" }), false);
  assert.equal(agentListingsMigrationHeld({ VERCEL_ENV: "preview" }), true);
  assert.equal(agentListingsHoldNotice({}), null);
  const notice = agentListingsHoldNotice({ VERCEL_ENV: "preview" });
  assert.match(notice ?? "", /production DATABASE_URL/);
  assert.match(notice ?? "", /not applied/);

  assert.deepEqual(pendingMigrations([name], [], { VERCEL_ENV: "production" }), [
    { name, path: name },
  ]);
  assert.deepEqual(pendingMigrations([name], [], {}), [{ name, path: name }]);
  assert.deepEqual(pendingMigrations([name], [], { VERCEL_ENV: "preview" }), []);

  const listed = readdirSync(join(projectRoot(), "migrations")).filter((entry) =>
    entry.endsWith(".sql"),
  );
  const preview = pendingMigrations(listed, [], { VERCEL_ENV: "preview" });
  assert.equal(
    preview.some((entry) => entry.name === name),
    false,
  );
  assert.equal(
    preview.some((entry) => entry.name === EXCHANGE_JOBS_MIGRATION),
    false,
  );
  assert.equal(
    preview.some((entry) => entry.name === "0026_hide_exchange_smoke_jobs.sql"),
    true,
  );
  assert.equal(
    preview.some((entry) => entry.name === "0028_hide_directory_smoke_listing.sql"),
    true,
  );
  const production = pendingMigrations(listed, [], { VERCEL_ENV: "production" });
  assert.equal(
    production.some((entry) => entry.name === name),
    true,
  );

  const migrate = readFileSync(join(projectRoot(), "scripts/migrate.mjs"), "utf8");
  const db = readFileSync(join(projectRoot(), "src/lib/db.ts"), "utf8");
  assert.match(migrate, /agentListingsHoldNotice/);
  assert.match(db, /agentListingsHoldNotice/);
});

test("hire orders migration applies in production and is skipped on preview", () => {
  const name = HIRE_ORDERS_MIGRATION;
  assert.equal(name, "0029_hire_orders.sql");
  const sql = readFileSync(join(projectRoot(), "migrations", name), "utf8");
  assert.match(sql, /create table if not exists hire_orders/i);
  assert.match(sql, /package_name text not null/);
  assert.match(sql, /amount_usd integer not null/);
  assert.match(sql, /brief text not null/);
  assert.match(sql, /email text not null/);
  assert.match(sql, /status text not null/);
  assert.match(sql, /stripe_session_id text/);
  assert.match(sql, /ip_hash text/);
  assert.doesNotMatch(sql, /\b(alter|drop|insert|update|delete)\b/i);
  assert.doesNotMatch(sql, /pay_requests|meter_invoices|exchange_jobs|agent_listings/);

  assert.equal(hireOrdersMigrationHeld({}), false);
  assert.equal(hireOrdersMigrationHeld({ VERCEL_ENV: "preview" }), true);
  assert.equal(hireOrdersHoldNotice({}), null);
  assert.match(hireOrdersHoldNotice({ VERCEL_ENV: "preview" }) ?? "", /not applied/);

  assert.deepEqual(pendingMigrations([name], [], { VERCEL_ENV: "preview" }), []);
  assert.deepEqual(pendingMigrations([name], [], { VERCEL_ENV: "production" }), [
    { name, path: name },
  ]);

  const listed = readdirSync(join(projectRoot(), "migrations")).filter((entry) =>
    entry.endsWith(".sql"),
  );
  const preview = pendingMigrations(listed, [], { VERCEL_ENV: "preview" });
  assert.equal(
    preview.some((entry) => entry.name === name),
    false,
  );
  const production = pendingMigrations(listed, [], { VERCEL_ENV: "production" });
  assert.equal(
    production.some((entry) => entry.name === name),
    true,
  );
});
