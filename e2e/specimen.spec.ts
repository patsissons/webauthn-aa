import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName } from "./support/aa";
import { CAPTURE_FRAME } from "./support/rp";

// The specimen-ID generator (now on the AA capture page) produces evidence the
// AA accepts, and the RP region dropdown shows the human-readable age constraint.
test("specimen generator + readable region constraints", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  await page.goto("/");

  // Region dropdown surfaces the constraint in human-readable form (on the RP).
  await expect(page.getByTestId("region")).toContainText("age ≥ 18");
  await expect(page.getByTestId("region")).toContainText("age ≥ 21");

  // Open the AA-origin capture dialog and generate an adult specimen in the frame.
  await page.getByTestId("start-capture").click();
  const frame = page.frameLocator(CAPTURE_FRAME);

  await frame.getByTestId("gen-adult").click();
  await expect(frame.getByTestId("photo-preview")).toBeVisible();
  await expect(frame.getByTestId("birth-date")).toHaveValue("1995-03-14");

  const name = `AVA ADULTSON ${Date.now()}`;
  await frame.getByTestId("claimed-name").fill(name);
  await frame.getByTestId("submit-evidence").click();
  await expect(page.getByTestId("status-waiting")).toBeVisible();

  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });
});
