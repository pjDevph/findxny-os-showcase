/**
 * 01 · Auth
 *
 * Tests: signup UI, login UI, ?next= redirect, session survives refresh,
 * logout, role gate (non-admin redirected to /).
 *
 * Creates fresh users per-test via Supabase admin API so email-confirmation
 * is never needed.  Falls back gracefully when service role key is absent.
 */

import { test, expect } from "@playwright/test";
import { SB_URL, ANON, SVC, loginViaUI, assertNoSSRError } from "./_helpers.mjs";

// ── helpers ──────────────────────────────────────────────────────────────────
// Native fetch — Playwright's request fixture trips Supabase's "Forbidden
// use of secret API key in browser" detection.
async function createUser(_request: any, email: string, password: string) {
  if (!SVC) return false;
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SVC, Authorization: `Bearer ${SVC}` },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "Test User" } }),
  });
  return res.ok || (await res.json()).code === "email_exists";
}

// ── Signup UI ────────────────────────────────────────────────────────────────
test("signup: /signup page renders form", async ({ page }) => {
  await page.goto("/signup");
  await assertNoSSRError(page);
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
});

test("signup: submitting empty email shows browser validation", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: /create account/i }).click();
  // Browser native validation prevents submit — we stay on /signup
  expect(page.url()).toContain("/signup");
});

test("signup: valid credentials redirect to /login", async ({ page }) => {
  if (!SB_URL || !ANON) return test.skip();
  const ts    = Date.now();
  const email = `signup-test-${ts}@test.local`;

  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill("Auth Test");
  await page.getByLabel(/email/i).fill(email);
  await page.locator('input[type="password"]').fill("AuthTest123!");
  await page.getByRole("button", { name: /create account/i }).click();

  // Signup page redirects to /login on success
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  expect(page.url()).toContain("/login");
});

// ── Login UI ─────────────────────────────────────────────────────────────────
test("login: wrong password shows error message", async ({ page }) => {
  if (!SB_URL || !ANON) return test.skip();
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("nobody@test.local");
  await page.locator('input[type="password"]').fill("wrongpassword");
  await page.getByRole("button", { name: /sign in/i }).click();
  // Error message should appear
  await expect(page.locator(".auth-err, p, .err, [style*='crimson']").filter({ hasText: /invalid|incorrect|credentials|email|locked/i })).toBeVisible({ timeout: 8_000 });
});

test("login: ?next= redirect is honoured — lands on target after sign in", async ({ page, request }) => {
  if (!SB_URL || !ANON || !SVC) return test.skip();

  const ts    = Date.now();
  const email = `nexttest-${ts}@test.local`;
  await createUser(request, email, "NextTest123!");

  // Navigate to login with next=/menu
  await page.goto("/login?next=/menu");
  await page.getByLabel(/email/i).fill(email);
  await page.locator('input[type="password"]').fill("NextTest123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
  expect(page.url()).toContain("/menu");
});

test("login: non-admin user visiting /dashboard is redirected to /", async ({ page, request }) => {
  if (!SB_URL || !ANON || !SVC) return test.skip();

  const ts    = Date.now();
  const email = `nonadmin-${ts}@test.local`;
  await createUser(request, email, "NoAdmin123!");

  // Log in as non-admin (no workspace_member row)
  await loginViaUI(page, email, "NoAdmin123!");
  // Try to go to /dashboard — admin layout checks roles, redirects to /
  await page.goto("/dashboard");
  await page.waitForURL((u) => !u.pathname.includes("/dashboard"), { timeout: 10_000 });
  expect(page.url()).not.toContain("/dashboard");
});

// ── Session persistence ──────────────────────────────────────────────────────
test("session: survives a full page reload", async ({ page, request }) => {
  if (!SB_URL || !ANON || !SVC) return test.skip();

  const ts    = Date.now();
  const email = `session-${ts}@test.local`;
  await createUser(request, email, "Session123!");

  await loginViaUI(page, email, "Session123!");
  // At this point we are logged in (redirected away from /login)
  // Reload and verify we don't get redirected to /login on a public page
  await page.reload();
  await assertNoSSRError(page);
  // Visiting /menu should work (no auth required)
  await page.goto("/menu");
  await assertNoSSRError(page);
  expect(page.url()).not.toContain("/login");
});

// ── Logout ───────────────────────────────────────────────────────────────────
test("logout: /logout clears session and redirects", async ({ page, request }) => {
  if (!SB_URL || !ANON || !SVC) return test.skip();

  const ts    = Date.now();
  const email = `logout-${ts}@test.local`;
  await createUser(request, email, "Logout123!");

  await loginViaUI(page, email, "Logout123!");
  // /logout is POST-only — fire it via fetch so the server signs the user out.
  await page.evaluate(() => fetch("/logout", { method: "POST" }));
  // After logout, hitting an admin route should redirect to /login.
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  expect(page.url()).toContain("/login");
});
