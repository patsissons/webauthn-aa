import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName } from "./support/aa";

// The in-app specimen-ID generator produces evidence the AA accepts, and the
// demo region dropdown shows the human-readable age constraint.
test("specimen generator + readable region constraints", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  await page.goto("/");

  // Region dropdown surfaces the constraint in human-readable form.
  await expect(page.getByTestId("region")).toContainText("age ≥ 18");
  await expect(page.getByTestId("region")).toContainText("age ≥ 21");

  // Generate an adult specimen card; it fills the fields and previews.
  await page.getByTestId("gen-adult").click();
  await expect(page.getByTestId("photo-preview")).toBeVisible();
  await expect(page.getByTestId("birth-date")).toHaveValue("1995-03-14");

  const name = `AVA ADULTSON ${Date.now()}`;
  await page.getByTestId("claimed-name").fill(name);
  await page.getByTestId("submit-evidence").click();
  await expect(page.getByTestId("status-waiting")).toBeVisible();

  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });
});
