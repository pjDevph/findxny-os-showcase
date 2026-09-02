# FINDXNY-OS Testing Strategy

Right-sized testing plan for the FINDXNY-OS monorepo (Next.js web app + Supabase edge functions). This is a **working document** — update as phases are completed or reprioritized.

Status: **Not yet implemented.** Current coverage is `tooling/scripts/smoke-test.mjs` only (writes to live Supabase — see [release-checklist.md](release-checklist.md)).

---

## Goals

1. Catch regressions in revenue-critical flows (booking, cart, checkout, admin) before they ship.
2. Surface schema/edge-function drift between repo and live Supabase project (the two failure modes we hit most).
3. Keep CI runtime under ~5 min on PR so reviewers don't wait.
4. Use only free/OSS tooling. No paid SaaS (BrowserStack, Cypress Cloud, etc.).

## Non-goals

- Enterprise-scale load testing (1,000 concurrent users). Realistic peak for a single cafe is ~20–50.
- Nightly active security scans. Noise/maintenance cost outweighs value at this size.
- Selenium / Selenium Grid. Playwright covers cross-browser without extra infra.
- 100% code coverage targets. Coverage is a side effect of good tests, not a goal.

---

## Stack decisions

| Layer | Tool | Rationale |
|---|---|---|
| E2E + cross-browser | **Playwright** | Same era as Next.js; built-in Chromium/Firefox/WebKit; first-class TS; trace viewer. |
| Accessibility | **@axe-core/playwright** | Runs inside existing Playwright specs — no separate job. |
| Unit / integration | **Vitest** | Fast, Vite-native, Jest-compatible API. |
| Edge function tests | **Vitest** against extracted pure handlers | Lets us test logic without `Deno.serve` wrapping. |
| Lighthouse | **Lighthouse CI** (`@lhci/cli`) | Free, posts PR comments, asserts on score thresholds. |
| Schema drift | **`supabase db diff`** (bundled CLI at `tooling/scripts/supabase.exe`) | FINDXNY-OS-specific check — see Phase 5. |
| Security (passive) | **OWASP ZAP baseline action** | PR-friendly passive scan; no risk of breaking staging. |
| Load (deferred) | **k6** | JS scripts; team can read/maintain. |

**Explicitly rejected:** Selenium, JMeter, Locust, Cypress, Nikto, nightly ZAP active scans.

---

## Phased rollout

Each phase is independent. Stop after any phase and still have value. Phases ordered by ROI — drop-off after Phase 5.

### Phase 1 — Playwright smoke tests *(highest ROI, ~half day)*

**Goal:** Cover the four revenue-critical flows. Zero existing coverage today.

**Setup:**
```powershell
cd apps/web
npm install -D @playwright/test
npx playwright install --with-deps
npx playwright init
```

**Specs to write in `apps/web/e2e/`:**
- `booking.spec.ts` — `/book` → pick room/time → submit booking
- `cart.spec.ts` — `/` add item → `/booking-cart` → place order
- `admin-login.spec.ts` — `/admin` log in → land on dashboard
- `maintenance-mode.spec.ts` — enable maintenance flag → verify customer pages show banner (regression for commit 48263df)

**Config:** point at local Next dev server by default; `BASE_URL` env var for staging runs.

**Critical:** tests must NOT write against the live Supabase project. Either:
- Stand up a dedicated staging Supabase project, OR
- Seed + teardown per-test via service-role key against a sandbox project.

See note in [Risks & open questions](#risks--open-questions).

---

### Phase 2 — Wire Playwright to CI *(~1 hr)*

`.github/workflows/e2e.yml`:
```yaml
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build --workspace=apps/web
      - run: npx playwright test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
```

Upload `playwright-report/` as an artifact on failure for debugging.

---

### Phase 3 — Add axe to Playwright *(~30 min)*

```powershell
npm install -D @axe-core/playwright
```

Per spec, after the page loads:
```ts
import AxeBuilder from '@axe-core/playwright'
const a11y = await new AxeBuilder({ page }).analyze()
expect(a11y.violations).toEqual([])
```

Free accessibility coverage. No extra CI job. Tune the rule set if false positives appear.

---

### Phase 4 — Vitest for utilities + edge function logic *(~half day)*

```powershell
cd apps/web
npm install -D vitest @vitest/ui
```

Add `"test": "vitest run"` to `apps/web/package.json`. Run in CI **before** Playwright.

**Target:**
1. Pure helpers in `apps/web/features/` and `apps/web/lib/` (no React/network deps).
2. Edge function business logic. Refactor each `supabase/functions/*/index.ts` to export a pure handler (no `Deno.serve` wrapping), then unit-test with a mocked Supabase client.

The edge-function refactor is the load-bearing part — it also makes the [edge-function deploy drift](../) failure mode catchable locally instead of only post-deploy.

---

### Phase 5 — Schema drift check *(~1 hr, FINDXNY-OS-specific)*

The single most important FINDXNY-OS-specific test. Committed migrations regularly diverge from the live DB.

**CI step:**
```powershell
./tooling/scripts/supabase.exe db diff --linked --schema public
```

Wire into a workflow that diffs a shadow DB built from `supabase/migrations/` against the live project. Any diff → fail the build with **"migrations are out of sync — apply via SQL editor or fix the migration."**

This is the test the generic web-app testing plan misses entirely.

---

### Phase 6 — Lighthouse CI *(~1 hr, optional)*

```powershell
npm install -D @lhci/cli
```

`lighthouserc.json` with URL list (`/`, `/book`, `/booking-cart`, `/admin`) and assertions on perf / a11y / best-practices scores. PR-comment integration via the `treosh/lighthouse-ci-action` GitHub Action.

---

### Phase 7 — OWASP ZAP baseline on PR *(~1 hr, optional)*

Use [zaproxy/action-baseline](https://github.com/zaproxy/action-baseline). **Passive scan only** — no active scanning on PRs. Fail the build on high-severity findings; warn on medium.

Schedule a full **active** scan via `workflow_dispatch` pre-release, not nightly.

---

### Phase 8 — k6 load tests *(deferred)*

Skip until there's a specific flow we're worried about. When justified:

```powershell
npm install -D k6
```

`tests/load/booking-flow.js`, target **realistic peak** (~50 VUs, not 1,000). Run manually pre-release or via `workflow_dispatch`. Never on every PR.

---

## Cadence

| When | What |
|---|---|
| **Every PR** | Vitest, Playwright smoke (Chromium only), axe checks, Lighthouse CI, schema-drift check, ZAP baseline |
| **Pre-release (manual)** | Full Playwright suite (all browsers), ZAP active scan, k6 load run |
| **Quarterly** | Prune flaky tests, review skipped specs, re-check tool relevance |

---

## What is NOT covered by this plan

Documented honestly so we don't pretend otherwise:

- **Visual regression.** Worth adding later via Playwright screenshot diffs for cart/booking UI.
- **Supabase RLS policy tests.** Recent RLS bug (commit 48263df) suggests these are worth dedicated tests.
- **Manual exploratory testing.** Still needed pre-release for UX polish.
- **Real device testing.** Playwright emulates viewports; doesn't replace a phone in someone's hand for the customer flow.

---

## Risks & open questions

1. **Staging Supabase project.** Phases 1–5 assume one exists. If not, Phase 0 is "stand one up." Cost: ~free on Supabase free tier; small ops investment.
2. **Edge function refactor scope.** Extracting pure handlers from every function may touch most of `supabase/functions/`. Could be done incrementally — start with the highest-traffic functions.
3. **CI minutes.** GitHub Actions free tier is 2,000 min/mo for private repos. Full suite per PR will burn through it on a busy week. If we hit the limit, drop Lighthouse + ZAP from per-PR to nightly.
4. **Flaky tests.** Playwright + Supabase backend = network flakiness. Plan for retry policy and a quarterly flake-pruning pass (in Cadence table).

---

## Suggested cut-off for v1

Phases 1–5. Skip 6–8 until a specific incident motivates them.

**Estimated effort:** ~1.5 days of focused work for a single engineer, plus the staging Supabase project setup.
