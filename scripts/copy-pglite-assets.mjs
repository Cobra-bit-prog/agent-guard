#!/usr/bin/env node
/**
 * Nitro's Vercel output bundles `@electric-sql/pglite` into the server
 * function but does not copy the sibling WASM / data files
 * `new URL("./pglite.data", import.meta.url)` needs.
 * Local `vite preview` (no DATABASE_URL) boots PGLite and would crash without
 * them. Harmless on Neon deploys — those never instantiate PGLite.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const funcDir = join(root, ".vercel/output/functions/__server.func");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

// Older Nitro builds keep PGLite in `_libs`. The current Vercel function is one
// index.mjs, and `new URL("./pglite.data", import.meta.url)` resolves beside it.
const destDirs = [join(funcDir, "_libs"), funcDir].filter(
  (dir) => existsSync(dir) && (dir === funcDir ? existsSync(join(dir, "index.mjs")) : true),
);

if (destDirs.length === 0) {
  console.log("[pglite-assets] no Vercel function output — skip");
  process.exit(0);
}

for (const destDir of destDirs) {
  mkdirSync(destDir, { recursive: true });
  for (const name of files) {
    const from = join(srcDir, name);
    const to = join(destDir, name);
    if (!existsSync(from)) {
      console.warn(`[pglite-assets] missing ${from}`);
      continue;
    }
    copyFileSync(from, to);
    console.log(`[pglite-assets] copied ${name} -> ${destDir}`);
  }
}
