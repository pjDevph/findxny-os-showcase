// =============================================================
// Shared helpers for the tooling/scripts/smoke-*.mjs smoke tests.
//
// Extracted from smoke-orders.mjs / smoke-booking.mjs / smoke-test.mjs to
// remove duplicated setup/auth/config, HTTP-wrapper, assertion-helper, and
// summary-printing code flagged by SonarQube CPD. Only code that was truly
// byte-for-byte (or parameter-for-parameter) identical across scripts was
// moved here — script-specific logic (e.g. smoke-orders.mjs's fnExpect400/
// dbPatch, smoke-booking.mjs's dbCount, smoke-test.mjs's record/call/headers
// pattern) stays in its original file.
// =============================================================

import { readFileSync } from "node:fs";
import { resolve }      from "node:path";

function loadEnvFile(path) {
  try {
    const text = readFileSync(resolve(path), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); // NOSONAR - applied to controlled internal data
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* ignore */ }
}

// Loads supabase/.env (if present) then reads the SUPABASE_* / SMOKE_* env
// vars shared by every smoke script, exiting the process if the required
// Supabase credentials are missing.
export function loadSmokeConfig({ emailPrefix = "", missingEnvMessage } = {}) {
  loadEnvFile("supabase/.env");

  const URL  = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY;
  const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const EMAIL    = process.env.SMOKE_EMAIL    || `smoke+${emailPrefix}${Date.now()}@example.test`;
  // Placeholder used only to create a throwaway smoke-test auth user; access is actually gated by
  // SUPABASE_SERVICE_ROLE_KEY (required above), so this is a documented local/dev default, not a
  // real secret. Override with SMOKE_PASSWORD when running against a shared environment.
  const PASSWORD = process.env.SMOKE_PASSWORD || "SmokeTest123!"; // NOSONAR - local-dev placeholder, not a real secret

  if (!URL || !ANON || !SVC) {
    console.error(missingEnvMessage ?? "Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const FN   = (n) => `${URL}/functions/v1/${n}`;
  const REST = (p) => `${URL}/rest/v1/${p}`;
  const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "content-type": "application/json" };

  return { URL, ANON, SVC, EMAIL, PASSWORD, FN, REST, svcH };
}

// results[] + pass/fail/skip/section console reporters shared by
// smoke-orders.mjs and smoke-booking.mjs.
export function createReporter() {
  const results = [];
  function pass(name, detail = "")  { results.push({ name, ok: true,  detail }); console.log(`[PASS] ${name}${detail ? "  — " + detail : ""}`); }
  function fail(name, detail = "")  { results.push({ name, ok: false, detail }); console.log(`[FAIL] ${name}  — ${detail}`); }
  function skip(name, detail = "")  { results.push({ name, ok: true,  detail: `[SKIP] ${detail}` }); console.log(`[SKIP] ${name}  — ${detail}`); }
  function section(title) { console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`); }
  return { results, pass, fail, skip, section };
}

// POST-to-edge-function wrapper shared by smoke-orders.mjs and smoke-booking.mjs.
export function makeFn(ANON, FN) {
  return async function fn(jwt, name, body) {
    const h = { apikey: ANON, Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
    const r = await fetch(FN(name), { method: "POST", headers: h, body: JSON.stringify(body) });
    const t = await r.text();
    let b; try { b = JSON.parse(t); } catch { b = t; }
    return { ok: r.ok, status: r.status, body: b };
  };
}

// Shared "expect a 409 Conflict" assertion helper.
export function makeFnExpect409(fn, pass, fail) {
  return async function fnExpect409(jwt, testName, fnName, body) {
    const r = await fn(jwt, fnName, body);
    if (r.status === 409) pass(testName, "409 Conflict as expected");
    else fail(testName, `Expected 409 but got ${r.status} — ${JSON.stringify(r.body).slice(0, 200)}`);
  };
}

// Shared PostgREST dbGet/dbInsert helpers.
export function makeDb(REST, svcH) {
  async function dbGet(table, filter) {
    const r = await fetch(REST(`${table}?${filter}&limit=1`), { headers: svcH });
    const b = await r.json();
    return Array.isArray(b) ? b[0] : null;
  }

  async function dbInsert(table, row) {
    const r = await fetch(REST(table), {
      method: "POST", headers: { ...svcH, Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    const b = await r.json();
    return Array.isArray(b) ? b[0] : b;
  }

  return { dbGet, dbInsert };
}

// Signs in (creating the throwaway smoke user first) — identical Auth section
// used by smoke-orders.mjs and smoke-booking.mjs. Exits the process on failure.
export async function signInSmokeUser({ URL, ANON, SVC, EMAIL, PASSWORD, pass, fail, printSummary, section }) {
  section("Auth");
  await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const b = await r.json();
  if (r.ok && b.access_token) {
    pass("auth.signin", EMAIL);
    return b.access_token;
  }
  fail("auth.signin", JSON.stringify(b).slice(0, 200));
  printSummary();
  process.exit(1);
}

// Creates the workspace + main branch used to seed the rest of the smoke
// run — same shape in smoke-orders.mjs ("Workspace & seed") and
// smoke-booking.mjs ("Workspace & resources"), differing only in the
// section title, slug prefix, and workspace display name. Exits the
// process on failure.
export async function createSmokeWorkspace({ fn, jwt, pass, fail, printSummary, section, sectionTitle, slugPrefix, workspaceName }) {
  section(sectionTitle);
  const wsSlug = `smoke-${slugPrefix}-${Date.now()}`;
  const r = await fn(jwt, "auth-create-workspace", {
    workspace: { name: workspaceName, slug: wsSlug, currency: "PHP" },
    branch:    { name: "Main", address: "Smoke St" },
  });
  if (!r.ok) {
    fail("workspace.create", JSON.stringify(r.body).slice(0, 200));
    printSummary();
    process.exit(1);
  }
  const wsId     = r.body.workspace.id;
  const branchId = r.body.branch.id;
  pass("workspace.create", `ws=${wsId.slice(0,8)} slug=${wsSlug}`);
  return { wsId, branchId, wsSlug };
}

// Shared summary/coverage printer used by smoke-orders.mjs and
// smoke-booking.mjs (each wraps this in its own no-arg `printSummary()`
// so existing call sites don't need to change). `groups` is the same
// [label, prefixes[]] coverage-breakdown structure each script already
// defined; `padWidth` preserves each script's original column alignment.
export function printSmokeSummary(results, { title, groups, padWidth = 20 } = {}) {
  const passed  = results.filter(r => r.ok).length;
  const failed  = results.filter(r => !r.ok).length;
  const total   = results.length;

  console.log(`\n${"═".repeat(64)}`);
  console.log(` ${title} — ${new Date().toLocaleTimeString()}`);
  console.log(`${"═".repeat(64)}`);
  console.log(` Total: ${total}   ✓ Passed: ${passed}   ✗ Failed: ${failed}`);

  if (failed) {
    console.log(`\n Failures:`);
    for (const r of results.filter(r => !r.ok)) console.log(`  ✗ ${r.name}: ${r.detail}`);
  }

  if (groups) {
    console.log(`\n Coverage:`);
    for (const [label, prefixes] of groups) {
      const subset = results.filter(r => prefixes.some(p => r.name.startsWith(p)));
      if (!subset.length) continue;
      const sp = subset.filter(r => r.ok).length;
      const sf = subset.length - sp;
      console.log(`   ${label.padEnd(padWidth)} ${sp}/${subset.length}${sf ? `  ✗ ${sf} failed` : ""}`);
    }
  }

  console.log(`${"═".repeat(64)}\n`);
  process.exit(failed ? 1 : 0);
}
