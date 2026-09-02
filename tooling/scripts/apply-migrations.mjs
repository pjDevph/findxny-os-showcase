#!/usr/bin/env node
// Apply all SQL files in supabase/migrations/ via the Supabase Management API.
// Avoids needing the DB password — uses SUPABASE_ACCESS_TOKEN (personal access token).
//
// Usage:
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
//   node tooling/scripts/apply-migrations.mjs <project-ref>

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = process.argv[2] || "your-project-ref";

if (!TOKEN) { console.error("SUPABASE_ACCESS_TOKEN not set"); process.exit(1); }

const dir = resolve("supabase/migrations");
const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort((a, b) => a.localeCompare(b));
console.log(`Applying ${files.length} migration(s) to project ${REF}...\n`);

let failed = 0;
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  process.stdout.write(`  ${f} ... `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log("OK");
  } else {
    console.log(`FAIL (HTTP ${res.status})`);
    console.log("    " + text.slice(0, 500).replace(/\n/g, "\n    "));
    failed++;
  }
}

console.log(`\nDone. ${files.length - failed}/${files.length} succeeded.`);
process.exit(failed ? 1 : 0);
