#!/usr/bin/env node
/**
 * public/sitemap.xml, agents.json, and agents.txt are the static base the
 * tests read. On Vercel those files would win over the server handler, so
 * the live response would omit directory listings. Delete them from the
 * static output after the build. The function serves the dynamic copies.
 */
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["sitemap.xml", "agents.json", "agents.txt", ".well-known/agents.json"];
const outputRoots = [
  join(root, ".vercel/output/static"),
  join(root, "dist/client"),
];

for (const outputRoot of outputRoots) {
  for (const file of files) {
    await rm(join(outputRoot, file), { force: true });
  }
}
