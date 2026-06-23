import { test, expect } from "@playwright/test";
import { sealEvidence } from "../apps/aa/lib/crypto";
import { AA_URL, RP_TOKEN, bearer, TINY_PNG_DATA_URL } from "./support/aa";

// "Reject all" bulk-rejects every pending request in one action.
test("reject-all rejects pending requests", async ({ request }) => {
  test.skip(!RP_TOKEN, "ATTESTATION_API_AUTH_TOKEN not loaded");

  const material = await (
    await request.post(`${AA_URL}/api/v1/encryption-material`, { headers: bearer() })
  ).json();
  const env = await sealEvidence(material.publicKeyJwk, {
    photo: TINY_PNG_DATA_URL,
    claimedName: `Bulk ${Date.now()}`,
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

  const res = await request.post(`${AA_URL}/api/review/reject-all`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.rejected).toBeGreaterThanOrEqual(1);

  const status = await (
    await request.get(`${AA_URL}/api/v1/transform/${requestId}`, { headers: bearer() })
  ).json();
  expect(status.status).toBe("rejected");
});
