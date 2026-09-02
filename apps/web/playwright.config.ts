import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PW_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,   // sequential — steps feed each other
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 40_000,
  expect: { timeout: 12_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/report", open: "never" }],
  ],

  globalSetup: "./e2e/_global-setup.mts",

  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      // Authenticated owner session — used by 02-customer + 03-admin specs
      name: "owner",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/owner.json",
      },
      testMatch: ["02-customer.spec.mts", "03-admin.spec.mts", "05-admin-crud.spec.mts"],
    },
    {
      // No persisted auth — preflight, auth, simulation run fresh
      name: "fresh",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["00-preflight.spec.mts", "01-auth.spec.mts", "04-simulation.spec.mts"],
    },
    {
      // Mobile smoke — homepage + menu at 390px
      name: "mobile",
      use: { ...devices["iPhone 14"] },
      testMatch: ["00-preflight.spec.mts"],
    },
  ],

  webServer: {
    command: "npm --workspace @aio/web run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
