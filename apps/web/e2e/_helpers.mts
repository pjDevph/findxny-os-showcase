/**
 * Shared utilities for all E2E test specs.
 */
import { expect, type Page, type APIRequestContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── State file ─────────────────────────────────────────────────────────────
export interface SimState {
  email: string;
  password: string;
  workspaceId: string;
  branchId: string;
  productAdobo: { id: string; name: string; price: number };
  productTea:   { id: string; name: string; price: number };
  inventoryAdoboId: string;
  inventoryTeaId:   string;
  lastOrderNo?: string;
  lastBookingId?: string;
}

const STATE_FILE = path.join(__dirname, ".fixtures/state.json");

export function readState(): SimState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {
      email: "", password: "", workspaceId: "", branchId: "",
      productAdobo: { id: "", name: "Adobo", price: 180 },
      productTea:   { id: "", name: "Iced Tea", price: 60 },
      inventoryAdoboId: "", inventoryTeaId: "",
    };
  }
}

export function writeState(patch: Partial<SimState>) {
  const existing = readState();
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...existing, ...patch }, null, 2));
}

// ── Env ────────────────────────────────────────────────────────────────────
function loadEnvFile(p: string) {
  try {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ok */ }
}
// Load .env.local first — it's the runtime source of truth (Next.js reads
// it). Its NEXT_PUBLIC_SUPABASE_ANON_KEY is the legacy JWT that the edge-
// function gateway still accepts; the publishable key in supabase/.env
// returns 401 from /functions/v1/*. SUPABASE_SERVICE_ROLE_KEY isn't in
// .env.local so we still need supabase/.env loaded for SVC.
loadEnvFile(path.join(__dirname, "../.env.local"));
loadEnvFile(path.join(__dirname, "../../..", "supabase/.env"));

export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ── Low-level API callers ──────────────────────────────────────────────────
// IMPORTANT: these intentionally use Node's native `fetch`, NOT Playwright's
// `APIRequestContext` (`request`). Supabase rejects the service-role key
// when the User-Agent looks browser-ish ("Forbidden use of secret API key in
// browser") — Playwright's request fixture trips that check. Native fetch
// from Node passes.
//
// The `request` arg is kept for backwards compatibility with existing
// callers but is no longer used internally.
export async function apiPost(
  _request: APIRequestContext | unknown,
  fnName: string,
  body: unknown,
  jwt?: string,
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${SB_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, body: json };
}

/** Sign in via Supabase password grant, return JWT. Uses native fetch — see
 *  apiPost comment for why we don't use Playwright's request fixture. */
export async function getJwt(_request: APIRequestContext | unknown, email: string, password: string): Promise<string> {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error(`Login failed: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

/** POST to Supabase REST as service-role (bypasses RLS, for test setup).
 *  Uses native fetch — see apiPost comment. */
export async function svcInsert(
  _request: APIRequestContext | unknown,
  table: string,
  body: unknown,
): Promise<any> {
  if (!SVC) return null;
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return Array.isArray(json) ? json[0] : json;
}

// ── Browser helpers ────────────────────────────────────────────────────────

/** Log in via the /login UI. Waits for redirect away from /login. */
export async function loginViaUI(page: Page, email: string, password: string, nextPath = "/") {
  await page.goto(`/login${nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  await page.getByLabel(/email/i).fill(email);
  // "Show password" toggle button also matches /password/i — target the input.
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

/** Assert no red ⨯ SSR errors visible in the terminal response body. */
export async function assertNoSSRError(page: Page) {
  // If Next.js SSR crashes, it renders an error page with "Application error"
  const body = await page.content();
  expect(body, "SSR error page detected").not.toContain("Application error");
}

/** Assert page has no browser-console errors after load. Collects messages. */
export function collectConsoleErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errs.push(msg.text());
  });
  return errs;
}

/** peso() mirrors lib/config.ts — used in assertions. */
export const peso = (n: number) => "₱ " + Math.round(n).toLocaleString("en-PH");

// ── Common assertions ──────────────────────────────────────────────────────

/** Verify the page is not blank and has the expected heading. */
export async function expectHeading(page: Page, pattern: string | RegExp) {
  await expect(page.getByRole("heading", { name: pattern }).first()).toBeVisible();
}

/** Verify a KPI card shows a number, not NaN / undefined / empty. */
export async function expectKpiNumber(page: Page, label: string | RegExp) {
  // Find the KPI card and assert its .val child contains digit characters
  const kpi = page.locator(".kpi", { has: page.locator(".lbl", { hasText: label }) });
  await expect(kpi).toBeVisible();
  const valText = await kpi.locator(".val").innerText();
  expect(valText, `KPI "${label}" should be a number`).toMatch(/[\d₱]/);
  expect(valText).not.toMatch(/NaN|undefined|null/);
}

/** Verify admin table renders at least one row (not the "No X found" empty state). */
export async function expectTableRows(page: Page, minRows = 1) {
  const rows = page.locator("table.admin-table tbody tr:not([class])");
  const count = await rows.count();
  // If the first row contains "empty" class, that's the empty-state row
  const first = rows.first();
  const isEmpty = await first.locator("td.empty").count() > 0;
  if (isEmpty) {
    throw new Error(`Table shows empty state, expected ≥ ${minRows} rows`);
  }
  expect(count).toBeGreaterThanOrEqual(minRows);
}

/** Add an item to cart from the /food-cart page. */
export async function addToCart(page: Page, productName: string) {
  const item = page.locator(".item", { has: page.locator(".name", { hasText: productName }) });
  const addBtn = item.locator(".add-btn");
  const qtyRow = item.locator(".qty-row");
  const hasQty = await qtyRow.count() > 0;
  if (hasQty) {
    await qtyRow.locator("button").last().click();
  } else {
    await addBtn.click();
  }
}
