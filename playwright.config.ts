import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // These tests hit a single shared, already-running local dev backend
  // (wrangler dev) backed by a real remote Postgres (Neon). That stack
  // is not built for high concurrency, so run serially to avoid flaky
  // hangs/timeouts from hammering it with parallel requests.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // 1 retry even locally: the local wrangler dev + remote Neon Postgres
  // stack occasionally has a slow/transient "Failed to fetch" on the very
  // first request after being idle (connection warm-up), unrelated to the
  // app/CORS code under test — confirmed by isolated curl checks of the
  // same OPTIONS preflight + POST succeeding reliably in that same window.
  retries: process.env.CI ? 2 : 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:5175",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
