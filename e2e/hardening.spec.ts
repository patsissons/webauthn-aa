import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { rejectPendingByName } from "./support/aa";
import { submitEvidence } from "./support/rp";

// Scenario 6: the reviewer rejects the evidence; the applicant sees "not
// eligible" and nothing is persisted (no passkey created).
test("scenario 6 — reviewer rejection persists nothing", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Rejected ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "1998-01-01", region: "region-1" });
  await rejectPendingByName(request, name);

  await expect(page.getByTestId("status-rejected")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("status-authenticated")).toHaveCount(0);

  // Nothing to authenticate with: a re-auth attempt finds no credential.
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-error")).toBeVisible();
});

// Fail-closed: when the AA errors (here, an unknown requestId → 404), the RP
// denies rather than granting (doc A.13 / B.6).
test("fail-closed when the AA errors", async ({ request }) => {
  const res = await request.post("http://localhost:3000/api/attest/status", {
    data: { requestId: "does-not-exist", demoRegion: "region-1" },
  });
  expect(res.status()).toBe(502);
  const json = await res.json();
  expect(json.status).toBe("error");
});
