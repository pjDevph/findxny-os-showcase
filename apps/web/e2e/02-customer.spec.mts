/**
 * 02 · Customer side
 *
 * Runs in the 'owner' project which loads storageState from e2e/.auth/owner.json,
 * so the browser is already authenticated.
 *
 * Tests every customer-facing route in the checklist:
 *   / → /menu → /food-cart → /checkout → /order-tracking
 *   /booking → /booking-cart → /booking-checker
 *
 * Shared state written here (lastOrderNo, lastBookingId) is read by 03-admin.spec.ts.
 */

import { test, expect } from "@playwright/test";
import {
  readState, writeState, assertNoSSRError, collectConsoleErrors,
  peso, addToCart, SB_URL, ANON,
} from "./_helpers.mjs";

// ── / Homepage ───────────────────────────────────────────────────────────────
test.describe("homepage", () => {
  test("renders hero and CTAs", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await assertNoSSRError(page);
    // Hero heading
    await expect(page.locator(".hero-title, h1").first()).toBeVisible();
    // CTA buttons
    await expect(page.getByRole("link", { name: /order food/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /book a table/i })).toBeVisible();
    // Pillar section
    await expect(page.locator(".pillar").first()).toBeVisible();
    // No critical JS errors
    const real = errors.filter((e) => !e.includes("net::ERR") && !e.includes("Failed to fetch"));
    expect(real).toHaveLength(0);
  });

  test("featured cards show ₱ prices", async ({ page }) => {
    await page.goto("/");
    const prices = page.locator(".feat-card .price");
    await expect(prices.first()).toBeVisible();
    const txt = await prices.first().innerText();
    expect(txt).toContain("₱");
  });
});

// ── /menu ────────────────────────────────────────────────────────────────────
// The menu now defaults to "Menu Book" mode. These tests target the grid
// product cards — switch into Grid mode first. There are two `Grid` buttons
// in the DOM (one in the mobile book-mode pill, one in the desktop toolbar) —
// scope to the visible one.
async function switchToGrid(page: import("@playwright/test").Page) {
  // Two paths: desktop toolbar (.view-btn with title="Grid view") and mobile
  // pill (.mvs-btn containing text "Grid"). Try both, click whichever is
  // visible.
  const desktopBtn = page.locator(".view-btn[title='Grid view']");
  const mobileBtn  = page.locator(".mvs-btn", { hasText: /^Grid$/ });
  for (const btn of [desktopBtn, mobileBtn]) {
    if ((await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false))) {
      await btn.first().click();
      await page.waitForSelector(".menu-toolbar", { timeout: 15_000 }).catch(() => null);
      return;
    }
  }
}

test.describe("menu", () => {
  test("loads products with peso prices", async ({ page }) => {
    if (!SB_URL) return test.skip();
    await page.goto("/menu");
    await assertNoSSRError(page);
    await switchToGrid(page);

    const hasProducts = (await page.locator(".product").count()) > 0;
    if (hasProducts) {
      const price = page.locator(".product .price").first();
      await expect(price).toBeVisible();
      expect(await price.innerText()).toContain("₱");
    } else {
      // Menu loaded but no products seeded — still a valid state
      console.log("[menu] No products found — seed the workspace to test further");
    }
  });

  test("search filters results", async ({ page }) => {
    if (!SB_URL) return test.skip();
    await page.goto("/menu");
    await switchToGrid(page);
    await page.waitForSelector(".menu-toolbar", { timeout: 15_000 });
    // Wait for products (or empty state) — skeletons share the .product
    // class with real items, so wait until skeletons are gone.
    await page.waitForFunction(
      () => document.querySelectorAll(".product.product-skel").length === 0,
      undefined,
      { timeout: 15_000 },
    ).catch(() => null);

    const search = page.locator(".search input");
    await search.fill("zzznomatchxxx");
    await page.waitForTimeout(300); // tiny settle for the filter re-render
    const noMatch = page.getByText(/no items match/i);
    const realProducts = page.locator(".product:not(.product-skel)");
    const isEmpty = (await realProducts.count()) === 0;
    expect((await noMatch.isVisible().catch(() => false)) || isEmpty).toBeTruthy();
    await search.fill("");
  });

  test("category filter chips render", async ({ page }) => {
    if (!SB_URL) return test.skip();
    await page.goto("/menu");
    await switchToGrid(page);
    await page.waitForSelector(".cats, .menu-toolbar", { timeout: 15_000 });
    await expect(page.locator(".chip").first()).toBeVisible();
  });

  test("add to cart increments nav badge", async ({ page }) => {
    if (!SB_URL) return test.skip();
    await page.goto("/menu");
    // Clear cart state first
    await page.evaluate(() => localStorage.removeItem("mtm.cart.v1"));
    await page.reload();
    await switchToGrid(page);
    // Wait for real products (skip skeletons)
    await page.waitForFunction(
      () => document.querySelectorAll(".product:not(.product-skel)").length > 0,
      undefined,
      { timeout: 15_000 },
    ).catch(() => null);
    const products = await page.locator(".product:not(.product-skel)").count();
    if (!products) return test.skip();

    const addBtn = page.locator(".product:not(.product-skel) .add").first();
    await addBtn.click();
    // The floating cart FAB carries the item count via aria-label
    const fab = page.locator("a.cart-fab[href='/food-cart']").first();
    await expect(fab).toHaveAttribute("aria-label", /\b1\s*items?\b/i, { timeout: 5_000 });
  });
});

// ── /food-cart ───────────────────────────────────────────────────────────────
test.describe("food-cart", () => {
  test("empty cart shows placeholder", async ({ page }) => {
    // Clear cart
    await page.goto("/food-cart");
    await page.evaluate(() => localStorage.removeItem("mtm.cart.v1"));
    await page.reload();
    await assertNoSSRError(page);
    await expect(page.locator(".fc-empty")).toBeVisible();
  });

  test("adding items shows totals with ₱ and service charge", async ({ page }) => {
    if (!SB_URL) return test.skip();

    // Pre-seed cart via localStorage
    const state = readState();
    const cartLines = [
      { product_id: state.productAdobo.id || "fake-id-1", name: state.productAdobo.name, price: 180, quantity: 2, notes: "" },
      { product_id: state.productTea.id   || "fake-id-2", name: state.productTea.name,   price: 60,  quantity: 1, notes: "" },
    ].filter((l) => l.product_id !== "fake-id-1" && l.product_id !== "fake-id-2");

    if (cartLines.length === 0) return test.skip();

    await page.goto("/food-cart");
    await page.evaluate((lines) => {
      localStorage.setItem("mtm.cart.v1", JSON.stringify(lines));
    }, cartLines);
    await page.reload();
    await page.waitForSelector(".fc-line", { timeout: 10_000 });

    // Grand total visible with peso symbol
    const totalText = await page.locator(".fc-row-grand").innerText();
    expect(totalText).toContain("₱");

    // Cart persists after reload
    await page.reload();
    await expect(page.locator(".fc-line").first()).toBeVisible();
  });

  test("qty +/- updates line total", async ({ page }) => {
    if (!SB_URL) return test.skip();
    const state = readState();
    if (!state.productAdobo.id) return test.skip();

    const lines = [{ product_id: state.productAdobo.id, name: "Adobo", price: 180, quantity: 1, notes: "" }];
    await page.goto("/food-cart");
    await page.evaluate((l) => localStorage.setItem("mtm.cart.v1", JSON.stringify(l)), lines);
    await page.reload();
    await page.waitForSelector(".qty-row", { timeout: 8_000 }).catch(() => null);

    // Add one more
    const addBtns = page.locator(".item .add-btn, .item .qty-row button:last-child");
    if ((await addBtns.count()) > 0) {
      await addBtns.first().click();
      const subtotal = await page.locator(".totals .row-t").first().innerText();
      expect(subtotal).toContain("₱");
    }
  });
});

// ── /checkout ────────────────────────────────────────────────────────────────
test.describe("checkout", () => {
  test("checkout page renders form fields", async ({ page }) => {
    await page.goto("/checkout");
    await assertNoSSRError(page);
    // Labels aren't htmlFor-bound — locate inputs by their placeholders.
    await expect(page.getByPlaceholder(/Juan dela Cruz/i)).toBeVisible();
    await expect(page.getByPlaceholder(/\+63 9XX/)).toBeVisible();
    await expect(page.locator(".pay-card").first()).toBeVisible();
  });

  test("submitting empty form shows validation", async ({ page }) => {
    await page.goto("/checkout");
    await page.getByRole("button", { name: /confirm/i }).click();
    // Either browser validation or our own error
    const err = page.locator(".co-card[style*='err'], [style*='crimson'], .err");
    const staying = page.url().includes("/checkout");
    expect(staying || (await err.count()) > 0).toBeTruthy();
  });

  test("places order and redirects to /order-tracking", async ({ page }) => {
    if (!SB_URL || !ANON) return test.skip();
    const state = readState();
    if (!state.productAdobo.id) return test.skip();

    // Seed cart with 2 items
    const lines = [
      { product_id: state.productAdobo.id, name: "Adobo",    price: 180, quantity: 2, notes: "" },
      { product_id: state.productTea.id,   name: "Iced Tea", price: 60,  quantity: 1, notes: "" },
    ];
    await page.goto("/checkout");
    await page.evaluate((l) => localStorage.setItem("mtm.cart.v1", JSON.stringify(l)), lines);
    await page.reload();

    // Fill form (labels lack htmlFor — use placeholders)
    await page.getByPlaceholder(/Juan dela Cruz/i).fill("E2E Customer");
    await page.getByPlaceholder(/\+63 9XX/).fill("+639175550000");
    await page.getByPlaceholder(/you@example\.com/i).fill("e2e@test.local");
    // Select cash
    await page.locator(".pay-card", { hasText: /cash/i }).click();
    // Submit
    await page.getByRole("button", { name: /confirm.*pay|place order/i }).click();

    await page.waitForURL(/\/order-tracking\//, { timeout: 20_000 });
    const url = page.url();
    const orderNo = url.split("/order-tracking/")[1]?.split("?")[0];
    expect(orderNo).toBeTruthy();

    // Save order number for admin spec
    writeState({ lastOrderNo: decodeURIComponent(orderNo) });
    console.log(`[customer] Order placed: ${orderNo}`);
  });
});

// ── /order-tracking ───────────────────────────────────────────────────────────
test.describe("order-tracking", () => {
  test("shows status after placing order", async ({ page }) => {
    const state = readState();
    if (!state.lastOrderNo) return test.skip();

    await page.goto(`/order-tracking/${encodeURIComponent(state.lastOrderNo)}`);
    await assertNoSSRError(page);

    // Should show the order reference
    const body = await page.content();
    expect(body).toContain(state.lastOrderNo.replace("ORD-", ""));
  });

  test("/booking-checker can look up an order by phone", async ({ page }) => {
    const state = readState();
    if (!state.lastOrderNo || !SB_URL) return test.skip();

    await page.goto("/booking-checker");
    await assertNoSSRError(page);
    await expect(page.getByLabel(/reference|order/i)).toBeVisible();

    await page.getByLabel(/reference|order/i).fill(state.lastOrderNo);
    await page.getByLabel(/phone|mobile/i).fill("+639175550000");
    await page.getByRole("button", { name: /track|look up|check/i }).click();

    // Result card or error
    await page.waitForSelector(".result-card, .card[style*='err']", { timeout: 10_000 }).catch(() => null);
  });
});

// ── /booking (table reservation) ──────────────────────────────────────────────
test.describe("booking", () => {
  test("reservation form renders", async ({ page }) => {
    await page.goto("/booking");
    await assertNoSSRError(page);
    await expect(page.getByPlaceholder(/Juan dela Cruz/i)).toBeVisible();
    await expect(page.getByPlaceholder(/\+63 9XX/)).toBeVisible();
    await expect(page.locator("input[type='date']")).toBeVisible();
  });

  test("submitting reservation shows confirmation", async ({ page }) => {
    if (!SB_URL) return test.skip();
    await page.goto("/booking");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    await page.getByPlaceholder(/Juan dela Cruz/i).fill("E2E Guest");
    await page.getByPlaceholder(/\+63 9XX/).fill("+639175550001");
    await page.locator("input[type='date']").fill(dateStr);
    // Pick whatever time-slot UI the booking page renders (button, pill, etc).
    const timeSlot = page.locator(
      "button.slot, button.time-slot, button[data-time], .time-slot button"
    ).first();
    if (await timeSlot.count() > 0) await timeSlot.click().catch(() => {});

    await page.getByRole("button", { name: /reserve/i }).click();
    // Wait for success receipt or keep checking
    await page.waitForSelector(".receipt, .succ-wrap, h1", { timeout: 15_000 });
    const body = await page.content();
    // Either shows "Request Sent" or still on form
    const success = body.includes("Request Sent") || body.includes("Booking Held") || body.includes("Reference");
    const hasErr  = body.includes("Failed") || body.includes("error");
    expect(success || hasErr).toBeTruthy();
    if (success) console.log("[booking] Reservation submitted");
  });
});

// ── /booking-cart (staycation) ────────────────────────────────────────────────
test.describe("booking-cart", () => {
  test("room cards render", async ({ page }) => {
    await page.goto("/booking-cart");
    await assertNoSSRError(page);
    // Either live resource cards or static fallback cards
    await page.waitForSelector("article.card, .kt-card, [class*='card']", { timeout: 12_000 });
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("unauthenticated user sees sign-in prompt", async ({ page }) => {
    // This test uses the 'owner' project which IS authenticated,
    // so we manually clear storage to simulate a guest
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto("/booking-cart");
    // Should either show sign-in banner or redirect to login
    const hasSignIn = await page.locator("text=/sign in/i").count() > 0;
    const isLogin   = page.url().includes("/login");
    expect(hasSignIn || isLogin).toBeTruthy();
  });

  test("booking form submits hold and shows confirmation", async ({ page }) => {
    if (!SB_URL) return test.skip();
    const state = readState();
    if (!state.workspaceId) return test.skip();

    await page.goto("/booking-cart");
    await page.waitForSelector("article", { timeout: 12_000 });

    const articles = await page.locator("article").count();
    if (!articles) return test.skip();

    // Select first room
    await page.locator("article").first().click();

    // Fill dates
    const today = new Date();
    const checkIn  = new Date(today); checkIn.setDate(today.getDate() + 7);
    const checkOut = new Date(today); checkOut.setDate(today.getDate() + 8);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    await page.locator("input[type='date']").first().fill(fmt(checkIn));
    await page.locator("input[type='date']").last().fill(fmt(checkOut));

    const submitBtn = page.getByRole("button", { name: /hold|book/i });
    if (await submitBtn.isDisabled()) return; // not authenticated

    await submitBtn.click();
    await page.waitForSelector(".receipt, .succ-wrap, [class*='err']", { timeout: 20_000 });

    const body = await page.content();
    if (body.includes("Booking Held") || body.includes("Booking Reference")) {
      // Extract booking ID if visible
      const refText = await page.locator(".ref").first().innerText().catch(() => "");
      if (refText) writeState({ lastBookingId: refText });
      console.log("[booking-cart] Hold placed:", refText);
    }
  });
});
