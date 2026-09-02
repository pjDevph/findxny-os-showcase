/**
 * Global setup — runs once before all Playwright tests.
 *
 * What it does:
 *  1. Loads env vars from supabase/.env + apps/web/.env.local
 *  2. Creates an owner test-user via the Supabase admin API (email_confirm:true,
 *     so no inbox needed)
 *  3. Signs in → gets a JWT
 *  4. Calls auth-create-workspace to provision workspace + branch
 *  5. Seeds 2 products (Adobo ₱180, Iced Tea ₱60) + inventory rows
 *  6. Launches a headless browser, logs in via the UI, and saves the
 *     browser's storage state to e2e/.auth/owner.json
 *  7. Writes e2e/.fixtures/state.json with all shared IDs + credentials
 *     so individual test files can read them
 */

import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ── env ────────────────────────────────────────────────────────────────────
function loadEnvFile(filePath: string) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* file may not exist in CI */ }
}

loadEnvFile(path.join(ROOT, "supabase/.env"));
loadEnvFile(path.join(__dirname, "../.env.local"));

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? process.env.SUPABASE_URL ?? "";
const ANON    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SVC     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE    = process.env.PW_BASE_URL ?? "http://localhost:3001";

if (!SB_URL || !ANON) {
  console.warn(
    "\n⚠  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not found.\n" +
    "   Copy apps/web/.env.example → apps/web/.env.local and fill in values.\n" +
    "   Global setup will be skipped; pre-flight tests will still run.\n"
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
const FN   = (name: string) => `${SB_URL}/functions/v1/${name}`;
const REST = (table: string) => `${SB_URL}/rest/v1/${table}`;

async function post(url: string, body: unknown, authHeader: string, extra: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "apikey": ANON, Authorization: authHeader, ...extra },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function svcPost(table: string, body: unknown) {
  const res = await fetch(REST(table), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": SVC,
      Authorization: `Bearer ${SVC}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json) ? json[0] : json;
}

// ── main ────────────────────────────────────────────────────────────────────
export interface SimState {
  email: string;
  password: string;
  workspaceId: string;
  branchId: string;
  productAdobo: { id: string; name: string; price: number };
  productTea:   { id: string; name: string; price: number };
  inventoryAdoboId: string;
  inventoryTeaId:   string;
  /** set during customer spec, read by admin spec */
  lastOrderNo?: string;
  lastBookingId?: string;
}

const STATE_FILE  = path.join(__dirname, ".fixtures/state.json");
const AUTH_FILE   = path.join(__dirname, ".auth/owner.json");

function writeState(state: Partial<SimState>) {
  let existing: Partial<SimState> = {};
  try { existing = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { /* ok */ }
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...existing, ...state }, null, 2));
}

// ── global setup entry ──────────────────────────────────────────────────────
export default async function globalSetup() {
  if (!SB_URL || !ANON) {
    // Write a stub state so test helpers don't crash on missing file
    writeState({ email: "", password: "", workspaceId: "", branchId: "",
      productAdobo: { id: "", name: "Adobo", price: 180 },
      productTea:   { id: "", name: "Iced Tea", price: 60 },
      inventoryAdoboId: "", inventoryTeaId: "" });
    return;
  }

  const ts       = Date.now();
  const email    = process.env.SIM_EMAIL    ?? `sim-owner-${ts}@test.local`;
  const password = process.env.SIM_PASSWORD ?? "SimTest123!";

  console.log(`\n[setup] Supabase: ${SB_URL}`);
  console.log(`[setup] Test user: ${email}\n`);

  // 1. Create user (service-role admin, email pre-confirmed)
  if (SVC) {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SVC, Authorization: `Bearer ${SVC}` },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "Sim Owner" } }),
    });
    const b = await r.json();
    if (!r.ok && b?.code !== "email_exists") {
      console.warn("[setup] Could not create user via admin API:", b);
    } else {
      console.log("[setup] ✓ User created / already exists");
    }
  }

  // 2. Sign in → JWT
  const signinRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  const signinBody = await signinRes.json();
  if (!signinRes.ok || !signinBody.access_token) {
    console.warn("[setup] Login failed — check credentials / email confirmation setting:", signinBody);
    writeState({ email, password, workspaceId: "", branchId: "",
      productAdobo: { id: "", name: "Adobo", price: 180 },
      productTea:   { id: "", name: "Iced Tea", price: 60 },
      inventoryAdoboId: "", inventoryTeaId: "" });
    return;
  }
  const jwt     = signinBody.access_token as string;
  const bearer  = `Bearer ${jwt}`;
  console.log("[setup] ✓ Signed in");

  // 3. Create workspace (skip if user already has one)
  let workspaceId = "";
  let branchId    = "";
  {
    const slug = `sim-${ts}`;
    const r = await post(FN("auth-create-workspace"), {
      workspace: { name: "Sim Cafe", slug, currency: "PHP" },
      branch:    { name: "Main Branch", address: "123 Smoke St" },
    }, bearer);

    if (r.ok) {
      workspaceId = r.body.workspace?.id ?? "";
      branchId    = r.body.branch?.id    ?? "";
      console.log(`[setup] ✓ Workspace ${workspaceId}  branch ${branchId}`);
    } else {
      // User might already have a workspace — try fetching via REST
      console.warn("[setup] auth-create-workspace failed, attempting REST fallback:", r.body);
      if (SVC) {
        const wm = await fetch(`${REST("workspace_members")}?select=workspace_id,branch_id,workspaces(id),branches(id)&limit=1`, {
          headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
        });
        const wmBody = await wm.json();
        workspaceId = wmBody[0]?.workspace_id ?? "";
        branchId    = wmBody[0]?.branch_id    ?? "";
      }
    }
  }

  if (!workspaceId || !branchId) {
    console.warn("[setup] No workspace/branch found — admin tests may show empty data");
  }

  // 4. Seed products + categories via service role (bypasses RLS)
  let catId = "";
  if (SVC && workspaceId) {
    const cat = await svcPost("product_categories", { workspace_id: workspaceId, name: "Food", sort_order: 1 });
    catId = cat?.id ?? "";
  }

  const adobo = SVC && workspaceId
    ? await svcPost("products", { workspace_id: workspaceId, category_id: catId || null,
        name: "Adobo", sku: `ADO-${ts}`, price: 180, kitchen_required: true })
    : null;
  const tea = SVC && workspaceId
    ? await svcPost("products", { workspace_id: workspaceId, category_id: catId || null,
        name: "Iced Tea", sku: `TEA-${ts}`, price: 60, kitchen_required: false })
    : null;

  console.log(`[setup] ✓ Products — Adobo:${adobo?.id ?? "skip"}  IcedTea:${tea?.id ?? "skip"}`);

  // 5. Seed inventory
  let invAdoboId = "";
  let invTeaId   = "";
  if (SVC && branchId && adobo?.id) {
    const ia = await svcPost("inventory_items", { workspace_id: workspaceId, branch_id: branchId,
      product_id: adobo.id, quantity: 50, unit: "pcs", low_stock_threshold: 5 });
    invAdoboId = ia?.id ?? "";
    const it = await svcPost("inventory_items", { workspace_id: workspaceId, branch_id: branchId,
      product_id: tea.id, quantity: 50, unit: "cups", low_stock_threshold: 5 });
    invTeaId = it?.id ?? "";
    console.log("[setup] ✓ Inventory seeded");
  }

  // 6. Write shared state for tests
  writeState({
    email, password,
    workspaceId, branchId,
    productAdobo: { id: adobo?.id ?? "", name: "Adobo", price: 180 },
    productTea:   { id: tea?.id   ?? "", name: "Iced Tea", price: 60 },
    inventoryAdoboId: invAdoboId,
    inventoryTeaId:   invTeaId,
  });

  // 7. Browser login → storageState (for 02-customer + 03-admin specs)
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const browser = await chromium.launch();
  const ctx     = await browser.newContext();
  const page    = await ctx.newPage();

  try {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(email);
    // Use the input role+type, not aria-label, since "Show password" button
    // also matches /password/i and breaks strict-mode locator resolution.
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Wait for redirect away from /login
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });

    // Manually seed the Supabase browser session into localStorage. Why:
    // @supabase/ssr stores the session in cookies (so SSR can read it), but
    // the BROWSER supabase client we use in client components (admin-client.ts)
    // ALSO reads from localStorage when calling functions.invoke(). Without
    // this seed, every browser-side edge-function call from the test fails
    // with "Failed to send a request to the Edge Function".
    const projectRef = new URL(SB_URL).hostname.split(".")[0]; // your-project-ref
    await page.evaluate(([ref, body]) => {
      const key = `sb-${ref}-auth-token`;
      // Supabase v2 session shape — keep keys it expects so it doesn't refetch.
      const session = {
        access_token:  body.access_token,
        refresh_token: body.refresh_token,
        expires_in:    body.expires_in,
        expires_at:    body.expires_at,
        token_type:    body.token_type ?? "bearer",
        user:          body.user,
      };
      localStorage.setItem(key, JSON.stringify(session));
    }, [projectRef, signinBody] as const);

    await ctx.storageState({ path: AUTH_FILE });
    console.log(`[setup] ✓ Browser auth state saved → ${AUTH_FILE}`);
  } catch (err) {
    console.warn("[setup] Could not save browser auth state:", err);
    // Write empty state so tests don't crash
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
  } finally {
    await browser.close();
  }

  console.log("[setup] Global setup complete.\n");
}
