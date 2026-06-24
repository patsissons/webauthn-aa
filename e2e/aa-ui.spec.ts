import { test, expect } from "@playwright/test";
import { sealEvidence } from "../apps/aa/lib/crypto";
import { AA_URL, RP_TOKEN, bearer, TINY_PNG_DATA_URL } from "./support/aa";

// The AA reviewer UI (review queue + attestation browser) updates over SSE — no
// polling. A request created via the API appears live, and approving it moves it
// live from the queue into the attestation browser.
test("AA reviewer UI updates live over SSE", async ({ page, request }) => {
  test.skip(!RP_TOKEN, "ATTESTATION_API_AUTH_TOKEN not loaded");
  await page.goto(AA_URL);

  const name = `SSE ${Date.now()}`;
  const material = await (
    await request.post(`${AA_URL}/api/v1/encryption-material`, { headers: bearer() })
  ).json();
  const env = await sealEvidence(material.publicKeyJwk, {
    photo: TINY_PNG_DATA_URL,
    claimedName: name,
    claimedBirthDate: "1990-01-01",
  });
  const { requestId } = await (
    await request.post(`${AA_URL}/api/v1/transform`, {
      headers: bearer(),
      data: {
        materialId: material.materialId,
        nonce: material.nonce,
        ...env,
        requestedAttributes: ["name", "age"],
      },
    })
  ).json();

  // Pushed into the review queue with no reload / no polling.
  await expect(page.getByTestId("review-list")).toContainText(name, { timeout: 10_000 });

  await request.post(`${AA_URL}/api/review/${requestId}`, { data: { action: "approve" } });

  // Moves live into the attestation browser.
  await expect(page.getByTestId("attestation-browser")).toContainText(name, { timeout: 10_000 });
});
