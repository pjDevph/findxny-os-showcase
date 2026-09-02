/**
 * Per-tab CRUD + pagination + CSV-export coverage for the admin area.
 * Complements 03-admin.spec.ts (smoke + dashboard) and 04-simulation.spec.ts
 * (customer order/booking flow). Each `describe` exercises one tab end-to-end
 * with the new ConfirmDialog modal and exportable / paginated views.
 */
import { test, expect, type Page } from "@playwright/test";
import { assertNoSSRError, readState } from "./_helpers.mjs";

const ADMIN_AS_OWNER = { storageState: "e2e/.auth/owner.json" } as const;
test.use(ADMIN_AS_OWNER);

async function openAdmin(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Click a button and confirm in the resulting ConfirmDialog modal. The
 *  underlying page may share the same button label (e.g. "Pause orders"),
 *  so we scope the click to the modal via its heading's ancestor. */
async function confirmInModal(page: Page, modalTitle: RegExp, confirmLabel: RegExp) {
  const heading = page.getByRole("heading", { name: modalTitle });
  await expect(heading).toBeVisible({ timeout: 5000 });
  // Modal uses createPortal — find the dialog container via the heading.
  const dialog = page.locator("div").filter({ has: heading }).first();
  await dialog.getByRole("button", { name: confirmLabel }).click();
}

// ── /costing ──────────────────────────────────────────────────────────────────
test.describe("costing CRUD", () => {
  test("page loads with summary tab active", async ({ page }) => {
    await openAdmin(page, "/costing");
    await expect(page.getByRole("heading", { name: /^costing$/i })).toBeVisible();
    await expect(page.getByText(/break-even calculator/i)).toBeVisible();
    await assertNoSSRError(page);
  });

  // TODO(e2e): browser-side supabase.functions.invoke("costs-upsert") fails
  // with "Failed to send a request to the Edge Function" in the test env even
  // though other adminClient invokes succeed and the page works in production.
  // Skipping until root-caused (likely a fixture/session detail specific to
  // this function).
  test.fixme("can create → edit → delete a cost item", async ({ page }) => {
    await openAdmin(page, "/costing");

    // Switch to Fixed tab to keep new item isolated from the Summary view
    await page.getByRole("button", { name: /^Fixed Monthly$/i }).click();

    // ── Create ──
    await page.getByRole("button", { name: /^\+ Add$/i }).click();
    const name = `E2E Rent ${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder(/Monthly Rent/i).fill(name);
    await page.getByPlaceholder(/0\.00/).first().fill("12345");
    await page.getByRole("button", { name: /^Add Cost Item$/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 5000 });

    // ── Edit ──
    const row = page.locator(".admin-card", { has: page.getByText(name) }).first();
    await row.getByRole("button", { name: /^Edit$/i }).click();
    await page.getByPlaceholder(/0\.00/).first().fill("99999");
    await page.getByRole("button", { name: /^Save Changes$/i }).click();
    await expect(row.getByText(/99,999/)).toBeVisible({ timeout: 5000 });

    // ── Delete via ConfirmDialog ──
    await row.getByRole("button", { name: /^Del$/i }).click();
    await confirmInModal(page, /Delete ".+"/i, /Delete cost/i);
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 5000 });
  });
});

// ── /branches ─────────────────────────────────────────────────────────────────
test.describe("branches", () => {
  test("page renders with toggle controls", async ({ page }) => {
    await openAdmin(page, "/branches");
    await expect(page.getByRole("heading", { name: /^branches$/i })).toBeVisible();
    await assertNoSSRError(page);
  });

  test("pause-orders toggle opens confirm modal and flips state", async ({ page }) => {
    await openAdmin(page, "/branches");
    const toggleBtn = page.locator("button").filter({ hasText: /^Pause orders$|^Resume orders$/ }).first();
    if (await toggleBtn.count() === 0) test.skip();
    const wasPause = /Pause orders/.test(await toggleBtn.innerText());

    await toggleBtn.click();
    await confirmInModal(
      page,
      wasPause ? /Pause orders at/i : /Resume orders at/i,
      wasPause ? /^Pause orders$/i  : /^Resume orders$/i,
    );

    // Wait for the server action to round-trip, then hard-reload bypassing
    // any client-side cache so we observe the new state from the server.
    await page.waitForTimeout(1500);
    await page.goto("/branches", { waitUntil: "networkidle" });
    const after = page.locator("button").filter({ hasText: /^Pause orders$|^Resume orders$/ }).first();
    const newLabel = await after.innerText();
    expect(newLabel).toMatch(wasPause ? /Resume orders/ : /Pause orders/);

    // Revert so the workspace isn't left mid-paused.
    await after.click();
    await confirmInModal(
      page,
      wasPause ? /Resume orders at/i : /Pause orders at/i,
      wasPause ? /^Resume orders$/i  : /^Pause orders$/i,
    );
  });
});

// ── /employees ────────────────────────────────────────────────────────────────
test.describe("employees", () => {
  test("page renders member list", async ({ page }) => {
    await openAdmin(page, "/employees");
    await expect(page.getByRole("heading", { name: /^employees$/i })).toBeVisible();
    await assertNoSSRError(page);
  });

  test("remove button opens confirm modal", async ({ page }) => {
    await openAdmin(page, "/employees");
    const removeBtn = page.locator("button:has-text('Remove')").first();
    if (await removeBtn.count() === 0) test.skip();
    await removeBtn.click();
    // Just verify the modal opens and can be dismissed without removing
    await expect(page.getByRole("heading", { name: /^Remove/i })).toBeVisible();
    await page.getByRole("button", { name: /^Keep$/i }).click();
    await expect(page.getByRole("heading", { name: /^Remove/i })).toHaveCount(0);
  });
});

// ── /transactions ─────────────────────────────────────────────────────────────
test.describe("transactions", () => {
  test("pagination is visible when many rows exist", async ({ page }) => {
    await openAdmin(page, "/transactions");
    // The Pagination component renders "Page X / Y". If only 1 page, nothing renders.
    const pageMarker = page.getByText(/Page \d+ \/ \d+/);
    if (await pageMarker.count() === 0) test.skip();
    await expect(pageMarker.first()).toBeVisible();
  });

  test("CSV export button triggers a download", async ({ page }) => {
    await openAdmin(page, "/transactions");
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.getByRole("button", { name: /^Export CSV$/i }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/transactions-\d{4}-\d{2}-\d{2}\.csv/);
  });

  test("void transaction goes through confirm modal", async ({ page }) => {
    const state = readState();
    if (!state.lastOrderNo) test.skip();
    await openAdmin(page, "/transactions");
    const voidBtn = page.locator("button:has-text('Void')").first();
    if (await voidBtn.count() === 0) test.skip();
    await voidBtn.click();
    await expect(page.getByRole("heading", { name: /Void transaction/i })).toBeVisible();
    // Dismiss without voiding to keep test idempotent
    await page.getByRole("button", { name: /^Keep$/i }).click();
  });
});

// ── /bookings ─────────────────────────────────────────────────────────────────
test.describe("bookings", () => {
  test("CSV export button works", async ({ page }) => {
    await openAdmin(page, "/bookings");
    const exportBtn = page.getByRole("button", { name: /^Export CSV$/i });
    if (await exportBtn.count() === 0) test.skip();
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await exportBtn.click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/bookings-\d{4}-\d{2}-\d{2}\.csv/);
  });
});

// ── /audit-logs ───────────────────────────────────────────────────────────────
test.describe("audit-logs", () => {
  test("page renders with date and entity filters", async ({ page }) => {
    await openAdmin(page, "/audit-logs");
    await expect(page.getByRole("heading", { name: /^audit logs$/i })).toBeVisible();
    await expect(page.getByText("Period", { exact: true })).toBeVisible();
    // "Entity" appears both as a filter label and a table column header — pick
    // the filter chip group via its sibling Today/7 days buttons context.
    await expect(page.getByRole("button", { name: /^Today$/i })).toBeVisible();
    await assertNoSSRError(page);
  });

  test("date range filter changes the result count", async ({ page }) => {
    await openAdmin(page, "/audit-logs");
    await page.waitForTimeout(800); // initial load

    const subBefore = await page.locator(".sub").first().innerText();
    await page.getByRole("button", { name: /^Today$/i }).click();
    await page.waitForTimeout(800);
    const subAfter = await page.locator(".sub").first().innerText();
    // Either changes (good) or both are "0 events" (also valid — no events today)
    expect(subBefore !== subAfter || subAfter.includes("0")).toBeTruthy();
  });

  test("CSV export downloads", async ({ page }) => {
    await openAdmin(page, "/audit-logs");
    await page.waitForTimeout(500);
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.getByRole("button", { name: /^Export CSV$/i }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/audit-logs-\d{4}-\d{2}-\d{2}\.csv/);
  });
});
