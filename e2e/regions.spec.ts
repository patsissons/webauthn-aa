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

// Scenario 4: an age-19 device attested under Region 1 is NOT eligible when the
// dropdown is set to Region 2 — re-auth misses the snapshot, the lazy AA refresh
// recomputes (still 19), and access is denied as "not eligible yet".
test("scenario 4 — threshold variation, not eligible", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Denied ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "2007-01-01", region: "region-1" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("region").selectOption("region-2");
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-not-eligible")).toBeVisible();
});

// Scenario 5: registering as age 19 with the dropdown on Region 2 still ISSUES
// the passkey (registration proves identity) but the user is not eligible now —
// and that same passkey authorizes for Region 1, which they do qualify for.
test("scenario 5 — passkey issued even when not eligible, works where it qualifies", async ({
  page,
  request,
}) => {
  await addVirtualAuthenticator(page);
  const name = `Gated ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "2007-01-01", region: "region-2" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-not-eligible")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("status-authenticated")).toHaveCount(0);

  // The passkey exists — it authorizes for Region 1 (age >= 18), which 19 meets.
  await page.getByTestId("region").selectOption("region-1");
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-authenticated")).toBeVisible();
  await expect(page.getByTestId("status-authenticated")).toContainText(name);
});
