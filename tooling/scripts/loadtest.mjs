// Configurable load tester for the Supabase Edge Functions (or any HTTP endpoint).
// Non-destructive by default (POSTs read-only public endpoints). For real load
// testing point it at a STAGING project, not the live multi-tenant one.
//
// Usage:
//   node tooling/scripts/loadtest.mjs [fn] [concurrency] [durationSec]
// Examples:
//   node tooling/scripts/loadtest.mjs public-menu 25 20
//   node tooling/scripts/loadtest.mjs public-rooms 50 30
//
// Reads the anon key + project URL from supabase/.env. Honors per-request
// failures (network blips count as errors, don't crash the run).
import { readFileSync } from "node:fs";

const env = readFileSync("supabase/.env", "utf8");
const g = (k) => (env.match(new RegExp("^\\s*" + k + "\\s*=\\s*(.+)$", "m")) || [])[1]?.trim();
const BASE = (g("NEXT_PUBLIC_SUPABASE_URL") || "").replace(/\/$/, "");
const ANON = g("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const FN          = process.argv[2] || "public-menu";
const CONCURRENCY = Number(process.argv[3] || 20);
const DURATION    = Number(process.argv[4] || 15) * 1000;
const BODY        = JSON.stringify({ slug: "demo-cafe" });
const URL         = `${BASE}/functions/v1/${FN}`;

const codes = {};
const lat = [];
let errors = 0, done = 0;
const headers = { apikey: ANON, Authorization: "Bearer " + ANON, "content-type": "application/json" };

async function worker(deadline) {
  while (Date.now() < deadline) {
    const t = Date.now();
    try {
      const r = await fetch(URL, { method: "POST", headers, body: BODY, signal: AbortSignal.timeout(15000) });
      await r.text();
      codes[r.status] = (codes[r.status] || 0) + 1;
      lat.push(Date.now() - t);
    } catch {
      errors++;
    }
    done++;
  }
}

console.log(`Load test: ${FN} | ${CONCURRENCY} workers | ${DURATION / 1000}s | ${URL}`);
const deadline = Date.now() + DURATION;
const start = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(deadline)));
const secs = (Date.now() - start) / 1000;

lat.sort((a, b) => a - b);
const pct = (q) => lat.length ? lat[Math.floor(q * (lat.length - 1))] : 0;
console.log(`\nrequests: ${done} in ${secs.toFixed(1)}s  ->  ${(done / secs).toFixed(0)} req/s`);
console.log(`status:`, codes, errors ? `| network/timeout errors: ${errors}` : "");
console.log(`latency ms: p50 ${pct(0.5)} | p90 ${pct(0.9)} | p95 ${pct(0.95)} | p99 ${pct(0.99)} | max ${lat[lat.length - 1] ?? 0}`);
const ok2xx = Object.entries(codes).filter(([c]) => c < 300).reduce((s, [, n]) => s + n, 0);
const rl429 = codes[429] || 0;
const e5xx = Object.entries(codes).filter(([c]) => c >= 500).reduce((s, [, n]) => s + n, 0);
console.log(`\nsummary: ${ok2xx} ok, ${rl429} rate-limited(429), ${e5xx} server-errors(5xx), ${errors} client/network`);
console.log(e5xx === 0 ? "✓ no 5xx — backend stayed healthy under load" : "⚠ 5xx under load — investigate DB/compute limits");
