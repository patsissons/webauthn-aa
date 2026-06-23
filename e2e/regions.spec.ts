import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName } from "./support/aa";
import { submitEvidence } from "./support/rp";

// Scenario 3: an age-28 device attested under Region 1 is still authorized when
// the dropdown is set to Region 2 (membership lookup, no re-attestation).
test("scenario 3 — threshold variation, allowed", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Allowed ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "1998-01-01", region: "region-1" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("region").selectOption("region-2");
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-authenticated")).toBeVisible();
  await expect(page.getByTestId("status-authenticated")).toContainText(name);
});

// Scenario 4: an age-19 device attested under Region 1 is denied when the
// dropdown is set to Region 2 (membership lookup, no recomputation).
test("scenario 4 — threshold variation, denied", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Denied ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "2007-01-01", region: "region-1" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("region").selectOption("region-2");
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-denied")).toBeVisible();
});

// Scenario 5: registering as age 19 with the dropdown on Region 2 fails the gate
// at registration — no passkey is created.
test("scenario 5 — gate rejection at registration", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Gated ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "2007-01-01", region: "region-2" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-not-eligible")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("status-authenticated")).toHaveCount(0);
});
