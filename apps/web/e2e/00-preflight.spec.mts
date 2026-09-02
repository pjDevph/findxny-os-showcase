/**
 * 00 · Pre-flight
 *
 * Checks that run before any interactive tests:
 *   - Server responds on expected port
 *   - Required env vars are present
 *   - Supabase API is reachable (menu endpoint)
 *   - No SSR error pages on key routes
 *   - Middleware redirects unauthenticated /dashboard → /login?next=/dashboard
 *   - Console is free of hydration warnings
 *   - Mobile viewport: homepage + menu are usable
 */

import { test, expect } from "@playwright/test";
import { SB_URL, ANON, assertNoSSRError, collectConsoleErrors } from "./_helpers.mjs";

// ── Env vars ────────────────────────────────────────────────────────────────
test("env: NEXT_PUBLIC_SUPABASE_URL is set", () => {
  expect(SB_URL, "Set NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local").toBeTruthy();
  expect(SB_URL).toMatch(/^https?:\/\//);
});

test("env: NEXT_PUBLIC_SUPABASE_ANON_KEY is set", () => {
  expect(ANON, "Set NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local").toBeTruthy();
  // Accept either format: legacy JWT (3 dot-separated segments) or the newer
  // Supabase publishable key (sb_publishable_*).
  const isJwt        = ANON.split(".").length === 3;
  const isPublishable = /^sb_publishable_/.test(ANON);
  expect(isJwt || isPublishable, "ANON should be a JWT or sb_publishable_* key").toBeTruthy();
});

// ── Server responds ─────────────────────────────────────────────────────────
test("server: homepage returns 200", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
});

test("server: /menu returns 200", async ({ page }) => {
  const res = await page.goto("/menu");
  expect(res?.status()).toBe(200);
});

test("server: /login returns 200", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.status()).toBe(200);
});

// ── Supabase API reachable ──────────────────────────────────────────────────
test("api: Supabase URL reachable (CORS preflight)", async ({ request }) => {
  // OPTIONS to the functions endpoint should return 200 or 204
  // (the edge functions send preflight headers)
  if (!SB_URL) return test.skip();
  const res = await request.fetch(`${SB_URL}/functions/v1/public-menu`, {
    method: "OPTIONS",
    headers: { "apikey": ANON, "origin": "http://localhost:3001" },
  });
  expect([200, 204]).toContain(res.status());
});

test("api: public-menu responds 200 for default workspace", async () => {
  if (!SB_URL || !ANON) return test.skip();
  // Native fetch — Playwright's request fixture trips Supabase's "Forbidden
  // use of secret API key in browser" detection on some endpoints.
  const res = await fetch(`${SB_URL}/functions/v1/public-menu`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({ slug: process.env.NEXT_PUBLIC_WORKSPACE_SLUG ?? "demo-cafe" }),
  });
  // 200 = workspace exists, 404 = slug not found (still reachable)
  expect([200, 404]).toContain(res.status);
  // Should never be 401 (CORS) or 5xx
  expect(res.status).toBeLessThan(500);
});

// ── Middleware: auth redirect ────────────────────────────────────────────────
test("middleware: /dashboard without auth redirects to /login", async ({ page }) => {
  await page.goto("/dashboard");
  // Wait for the redirect to settle
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  expect(page.url()).toContain("/login");
  expect(page.url()).toContain("next=");
  expect(page.url()).toContain("/dashboard");
});

test("middleware: /orders without auth redirects to /login", async ({ page }) => {
  await page.goto("/orders");
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  expect(page.url()).toContain("/login");
});

// ── SSR clean ───────────────────────────────────────────────────────────────
test("ssr: homepage renders without error page", async ({ page }) => {
  await page.goto("/");
  await assertNoSSRError(page);
  // Hero section
  await expect(page.locator(".hero-title, h1").first()).toBeVisible();
});

test("ssr: /menu renders without error page", async ({ page }) => {
  await page.goto("/menu");
  await assertNoSSRError(page);
});

test("ssr: /food-cart renders without error page", async ({ page }) => {
  await page.goto("/food-cart");
  await assertNoSSRError(page);
});

test("ssr: /booking renders without error page", async ({ page }) => {
  await page.goto("/booking");
  await assertNoSSRError(page);
});

test("ssr: /booking-cart renders without error page", async ({ page }) => {
  await page.goto("/booking-cart");
  await assertNoSSRError(page);
});

test("ssr: /booking-checker renders without error page", async ({ page }) => {
  await page.goto("/booking-checker");
  await assertNoSSRError(page);
});

// ── Console clean ───────────────────────────────────────────────────────────
test("console: no JS errors on homepage load", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Filter out known benign warnings (hot-reload, etc.)
  const real = errors.filter((e) =>
    !e.includes("hot-update") &&
    !e.includes("webpack") &&
    !e.includes("Failed to fetch") &&  // Supabase not configured locally
    !e.includes("net::ERR")             // network errors expected without real SB
  );
  expect(real, `Console errors: ${real.join("\n")}`).toHaveLength(0);
});

// ── 404 ─────────────────────────────────────────────────────────────────────
test("404: unknown route renders not-found page, not a crash", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist-xyz-999");
  // Next.js App Router returns 404 for unknown routes
  // (may be 200 from the server with a not-found component)
  expect(res?.status()).not.toBe(500);
  const body = await page.content();
  expect(body).not.toContain("Application error");
});

// ── Currency format ──────────────────────────────────────────────────────────
test("currency: peso symbol ₱ visible on homepage featured cards", async ({ page }) => {
  await page.goto("/");
  // Featured cards with hardcoded prices
  await expect(page.locator("text=₱").first()).toBeVisible();
});

// ── Mobile viewport ──────────────────────────────────────────────────────────
// (only runs in the 'mobile' project via testMatch)
test("mobile: homepage hero visible at 390px", async ({ page }) => {
  // Playwright sets viewport via the project definition (iPhone 14)
  await page.goto("/");
  await expect(page.locator(".hero-title, h1").first()).toBeVisible();
  // Nav should be present (may be collapsed)
  await expect(page.locator(".nav")).toBeVisible();
});

test("mobile: /menu renders product cards at 390px", async ({ page }) => {
  await page.goto("/menu");
  await assertNoSSRError(page);
  // Mobile defaults to immersive book view which hides the page hero — just
  // assert one of the known menu-mode elements is visible.
  const grid = page.locator(".menu-toolbar, .product, .book-wrap, .menu-view-switcher").first();
  await expect(grid).toBeVisible({ timeout: 15_000 });
});
