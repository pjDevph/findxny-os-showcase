#!/usr/bin/env node
// Wipe the demo workspace and reseed with clean data.
// Usage:  node tooling/scripts/wipe-and-reseed.mjs [project-ref]
//
// Reads SUPABASE_ACCESS_TOKEN from env or supabase/.env automatically.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path) {
  try {
    const text = readFileSync(resolve(path), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); // NOSONAR - applied to controlled internal data
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv("supabase/.env");

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = process.argv[2] || "your-project-ref";

if (!TOKEN) { console.error("SUPABASE_ACCESS_TOKEN not set"); process.exit(1); }

async function runSql(label, file, { optional = false } = {}) {
  const sql = readFileSync(resolve(file), "utf8");
  console.log(`[${label}] Applying ${file} ...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`[${label}] OK`);
  } else if (optional) {
    console.warn(`[${label}] SKIPPED (schema mismatch):`, JSON.parse(text).message ?? text);
  } else {
    console.error(`[${label}] FAILED:`, text);
    process.exit(1);
  }
}

console.log(`Target project: ${REF}\n`);
await runSql("wipe",        "supabase/seed/wipe.sql");
await runSql("seed",        "supabase/seed/seed.sql");
await runSql("ingredients", "supabase/seed/seed_ingredients.sql", { optional: true });
console.log("\nDone — database reset to clean seed state.");
