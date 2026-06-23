import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";

// Phase 1 acceptance: a user registers a passkey and re-authenticates with it.
test("register a passkey, then re-authenticate with it only", async ({ page }) => {
  await addVirtualAuthenticator(page);

  await page.goto("/");
  await page.getByTestId("display-name").fill("Ada Lovelace");
  await page.getByTestId("register-btn").click();

  const authed = page.getByTestId("status-authenticated");
  await expect(authed).toBeVisible();
  await expect(authed).toContainText("Ada Lovelace");

  // Reload to clear UI state, then authenticate with the passkey alone.
  await page.reload();
  await page.getByTestId("authenticate-btn").click();
  await expect(page.getByTestId("status-authenticated")).toBeVisible();
  await expect(page.getByTestId("status-authenticated")).toContainText("Ada Lovelace");
});
