import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName } from "./support/aa";
import { submitEvidence } from "./support/rp";

// Full round trip: evidence is captured + encrypted in the AA-origin popup, the
// RP relays ciphertext, a reviewer approves, and the user lands authenticated —
// then re-authenticates with the passkey alone.
test("full round trip: unauthenticated → evidence → approved → authenticated", async ({
  page,
  request,
}) => {
  await addVirtualAuthenticator(page);
  const name = `Grace Hopper ${Date.now()}`;

  await submitEvidence(page, { name, birthDate: "1990-01-01", region: "region-1" });
  await approvePendingByName(request, name);

  const authed = page.getByTestId("status-authenticated");
  await expect(authed).toBeVisible({ timeout: 30_000 });
  await expect(authed).toContainText(name);
  await expect(page.getByTestId("constraint-age_gte_18")).toBeVisible();
  await expect(page.getByTestId("constraint-age_gte_21")).toBeVisible();

  // Cheap repeat: re-authenticate with the passkey only (no photo, no AA call).
  await page.reload();
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-authenticated")).toBeVisible();
  await expect(page.getByTestId("status-authenticated")).toContainText(name);
});
