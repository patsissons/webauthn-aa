import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName, findAttestationIdByName, revokeAttestation } from "./support/aa";
import { submitEvidence } from "./support/rp";

// Scenario 7: revoking an issued attestation webhooks the RP, which invalidates
// the binding; the device's next re-auth is denied and routed to re-attestation.
test("scenario 7 — revocation forces re-attestation", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Revoke ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "1998-01-01", region: "region-1" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  // Reviewer revokes; immediate webhook delivery invalidates the RP binding.
  const attestationId = await findAttestationIdByName(request, name);
  await revokeAttestation(request, attestationId);

  await page.reload();
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-denied")).toBeVisible();
  await expect(page.getByTestId("status-denied")).toContainText("revoked");
});

// Scenario 8: after the attestation TTL passes, the next re-auth is denied on
// freshness even with no webhook, and routes to re-attestation.
test("scenario 8 — TTL expiry forces re-attestation", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Expire ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "1998-01-01", region: "region-1" });
  // Approve with a very short attested-payload TTL.
  await approvePendingByName(request, name, { ttlMs: 2000 });
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  // Wait for the attestation to expire, then re-auth.
  await page.waitForTimeout(2500);
  await page.reload();
  await page.getByTestId("reauth-btn").click();
  await expect(page.getByTestId("status-denied")).toBeVisible();
  await expect(page.getByTestId("status-denied")).toContainText("expired");
});
