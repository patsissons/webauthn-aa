import { test, expect } from "@playwright/test";
import { addVirtualAuthenticator } from "./support/webauthn";
import { approvePendingByName, findAttestationIdByName, revokeAttestation } from "./support/aa";
import { submitEvidence } from "./support/rp";

// The Logout button resets the authenticated UI (the credential is the identity;
// logout just ends the local session).
test("logout ends the authenticated session", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `Logout ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "1998-01-01", region: "region-1" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("logout-btn").click();
  await expect(page.getByTestId("status-authenticated")).toHaveCount(0);
  await expect(page.getByTestId("logout-btn")).toHaveCount(0);
  await expect(page.getByTestId("start-capture")).toBeVisible();
});

// Revoking the attestation pushes a real-time logout over SSE — no reload.
test("revocation logs the user out in real time", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const name = `LiveRevoke ${Date.now()}`;
  await submitEvidence(page, { name, birthDate: "1998-01-01", region: "region-1" });
  await approvePendingByName(request, name);
  await expect(page.getByTestId("status-authenticated")).toBeVisible({ timeout: 30_000 });

  // Reviewer revokes; the open page should flip to logged-out on its own.
  const attestationId = await findAttestationIdByName(request, name);
  await revokeAttestation(request, attestationId);

  await expect(page.getByTestId("status-session-ended")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("status-session-ended")).toContainText("revoked");
});
