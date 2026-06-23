import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName } from "./support/aa";

// The specimen-ID generator (now on the AA capture page) produces evidence the
// AA accepts, and the RP region dropdown shows the human-readable age constraint.
test("specimen generator + readable region constraints", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  await page.goto("/");

  // Region dropdown surfaces the constraint in human-readable form (on the RP).
  await expect(page.getByTestId("region")).toContainText("age ≥ 18");
  await expect(page.getByTestId("region")).toContainText("age ≥ 21");

  // Open the AA-origin capture popup and generate an adult specimen there.
  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("start-capture").click();
  const popup = await popupPromise;

  await popup.getByTestId("gen-adult").click();
  await expect(popup.getByTestId("photo-preview")).toBeVisible();
  await expect(popup.getByTestId("birth-date")).toHaveValue("1995-03-14");

  const name = `AVA ADULTSON ${Date.now()}`;
  await popup.getByTestId("claimed-name").fill(name);
  await popup.getByTestId("submit-evidence").click();
  await expect(page.getByTestId("status-waiting")).toBeVisible();

  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });
});
