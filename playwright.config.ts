import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Make shared secrets (RP<->AA token, webhook secret) available to API-level tests.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

// End-to-end tests drive the full running stack (both Next apps + both
// PocketBase instances) with a Chromium virtual WebAuthn authenticator.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `dev:test` runs the full stack against ISOLATED PocketBase data dirs
    // (pb_data_test) so e2e runs never pollute the `pnpm dev` database.
    // reuseExistingServer is off so a manually-running `pnpm dev` (which uses the
    // real data dirs) is never reused — stop it before running e2e.
    command: "pnpm dev:test",
    url: "http://localhost:3000",
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
