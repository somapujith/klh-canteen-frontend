import { test, expect } from "@playwright/test";

/**
 * Regression coverage for the CORS bug that broke POST /auth/login:
 *  - CORS_ORIGIN in Canteen-Backend/.env was hardcoded to a prod URL instead of "*".
 *  - app.onError() returned a raw Response bypassing the CORS middleware, so ANY
 *    error response (401/400/etc.) was missing Access-Control-Allow-Origin even
 *    though success responses had it.
 *
 * These tests hit the real, already-running frontend (http://localhost:5175) which
 * calls the real, already-running backend (http://localhost:8787) over the network.
 * Nothing is mocked.
 */

const SUPERADMIN_EMAIL = "superadmin@klh.edu.in";
const SUPERADMIN_PASSWORD = "changeme123";

test.describe("Login (real network, no mocks)", () => {
  test("invalid credentials surface a real HTTP error, not a CORS/network failure", async ({ page }) => {
    const requestErrors: string[] = [];
    page.on("requestfailed", (request) => {
      if (request.url().includes("/auth/login")) {
        requestErrors.push(request.failure()?.errorText ?? "unknown failure");
      }
    });

    await page.goto("/login");
    await page.getByRole("button", { name: "KLH University" }).click();

    await page.locator("#identifier").fill("nobody@klh.edu.in");
    await page.locator("#password").fill("wrong-password");

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/auth/login")),
      page.getByRole("button", { name: "Log In" }).click(),
    ]);

    // The request must actually complete at the network level (proves CORS preflight
    // and the error response both carry Access-Control-Allow-Origin correctly).
    expect(requestErrors, `request-level network failures: ${requestErrors.join(", ")}`).toHaveLength(0);

    // Must be a real HTTP error status from the backend, not a browser-level failure.
    expect([400, 401]).toContain(response.status());

    // The app renders the error message inside the form in a red alert box.
    const alert = page.locator("div.bg-red-50");
    await expect(alert).toBeVisible();
    const alertText = (await alert.textContent()) ?? "";

    // Must be the backend's real error message, never a CORS/network failure string.
    expect(alertText).not.toMatch(/failed to fetch|network error|cors|net::err/i);
    expect(alertText).toMatch(/invalid credentials/i);

    // Still on the login page — login did not succeed.
    await expect(page).toHaveURL(/\/login$/);
  });

  test("valid seeded superadmin credentials log in and reach an authenticated view", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "KLH University" }).click();

    await page.locator("#identifier").fill(SUPERADMIN_EMAIL);
    await page.locator("#password").fill(SUPERADMIN_PASSWORD);

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/auth/login")),
      page.getByRole("button", { name: "Log In" }).click(),
    ]);

    expect(response.status()).toBe(200);

    // Login form must be gone and the app must have routed away from /login.
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.locator("#identifier")).toHaveCount(0);

    // Auth state persisted correctly (real login response stored, real role).
    const stored = await page.evaluate(() => localStorage.getItem("klh_auth"));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string) as { token: string; role: string; name: string };
    expect(parsed.token).toBeTruthy();
    expect(parsed.role).toBe("SUPERADMIN");

    // The authenticated shell (Navbar) is rendered, proving a real protected page mounted.
    await expect(page.locator("nav")).toBeVisible();
  });

  test("picking DRK shows DRK branding and hides the KLH demo quick-fill buttons", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "DRK Institution" }).click();

    await expect(page.getByText(/sign in to your drk institution/i)).toBeVisible();
    await expect(page.getByText(/quick fill/i)).toHaveCount(0);
  });
});
