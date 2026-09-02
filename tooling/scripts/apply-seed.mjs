#!/usr/bin/env node
// Apply supabase/seed/seed.sql via the Management API.
// Usage:  node tooling/scripts/apply-seed.mjs <project-ref>

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

const sql = readFileSync(resolve("supabase/seed/seed.sql"), "utf8");
console.log(`Seeding project ${REF}...`);
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
if (res.ok) console.log("Seed applied OK");
else { console.error("FAIL:", text); process.exit(1); }
