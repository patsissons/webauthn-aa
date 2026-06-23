import { test, expect } from "@playwright/test";
import { sealEvidence } from "../apps/aa/lib/crypto";
import { ageFromBirthDate } from "@webauthn-aa/constraints";
import { AA_URL, RP_TOKEN, bearer, TINY_PNG_DATA_URL } from "./support/aa";

// Phase 2 acceptance: a scripted RP token submits ciphertext, a reviewer
// approves, and the AA returns the token-scoped attributes (name, age) — never
// the date of birth.
test("transform → reviewer approve → scoped attributes return", async ({ request }) => {
  test.skip(!RP_TOKEN, "ATTESTATION_API_AUTH_TOKEN not loaded");

  // 1. Fetch single-use encryption material.
  const matRes = await request.post(`${AA_URL}/api/v1/encryption-material`, {
    headers: bearer(),
  });
  expect(matRes.ok()).toBeTruthy();
  const material = await matRes.json();

  // 2. Seal evidence to the AA public key (simulating the browser envelope).
  const birthDate = "1990-06-15";
  const env = await sealEvidence(material.publicKeyJwk, {
    photo: TINY_PNG_DATA_URL,
    claimedName: "Grace Hopper",
    claimedBirthDate: birthDate,
  });

  // 3. Submit the transform.
  const txRes = await request.post(`${AA_URL}/api/v1/transform`, {
    headers: bearer(),
    data: {
      materialId: material.materialId,
      nonce: material.nonce,
      ...env,
      requestedAttributes: ["name", "age"],
    },
  });
  expect(txRes.ok()).toBeTruthy();
  const { requestId, status } = await txRes.json();
  expect(status).toBe("pending");

  // 4. Status is pending before review.
  const pending = await (
    await request.get(`${AA_URL}/api/v1/transform/${requestId}`, { headers: bearer() })
  ).json();
  expect(pending.status).toBe("pending");

  // 5. Reviewer approves (internal endpoint).
  const approveRes = await request.post(`${AA_URL}/api/review/${requestId}`, {
    data: { action: "approve", reviewedName: "Grace Hopper", reviewedBirthDate: birthDate },
  });
  expect(approveRes.ok()).toBeTruthy();

  // 6. Status now approved with scoped attributes; no DOB leaks.
  const approved = await (
    await request.get(`${AA_URL}/api/v1/transform/${requestId}`, { headers: bearer() })
  ).json();
  expect(approved.status).toBe("approved");
  expect(approved.attestationId).toBeTruthy();
  expect(approved.attributes.name).toBe("Grace Hopper");
  expect(approved.attributes.age).toBe(ageFromBirthDate(birthDate));
  expect(approved.attributes).not.toHaveProperty("birthDate");
  expect(approved.attributes).not.toHaveProperty("claimedBirthDate");
  expect(approved.ttl).toBeGreaterThan(0);
});

test("transform rejects attributes outside the token scope", async ({ request }) => {
  test.skip(!RP_TOKEN, "ATTESTATION_API_AUTH_TOKEN not loaded");

  const material = await (
    await request.post(`${AA_URL}/api/v1/encryption-material`, { headers: bearer() })
  ).json();
  const env = await sealEvidence(material.publicKeyJwk, {
    photo: TINY_PNG_DATA_URL,
    claimedName: "Eve",
    claimedBirthDate: "2000-01-01",
  });
  const res = await request.post(`${AA_URL}/api/v1/transform`, {
    headers: bearer(),
    data: {
      materialId: material.materialId,
      nonce: material.nonce,
      ...env,
      requestedAttributes: ["name", "ssn"],
    },
  });
  expect(res.status()).toBe(403);
});

test("transform refuses a replayed (already-used) material", async ({ request }) => {
  test.skip(!RP_TOKEN, "ATTESTATION_API_AUTH_TOKEN not loaded");

  const material = await (
    await request.post(`${AA_URL}/api/v1/encryption-material`, { headers: bearer() })
  ).json();
  const seal = () =>
    sealEvidence(material.publicKeyJwk, {
      photo: TINY_PNG_DATA_URL,
      claimedName: "Replay",
      claimedBirthDate: "1995-03-03",
    });

  const first = await request.post(`${AA_URL}/api/v1/transform`, {
    headers: bearer(),
    data: {
      materialId: material.materialId,
      nonce: material.nonce,
      ...(await seal()),
      requestedAttributes: ["name", "age"],
    },
  });
  expect(first.ok()).toBeTruthy();

  // Same material, second use must be refused.
  const replay = await request.post(`${AA_URL}/api/v1/transform`, {
    headers: bearer(),
    data: {
      materialId: material.materialId,
      nonce: material.nonce,
      ...(await seal()),
      requestedAttributes: ["name", "age"],
    },
  });
  expect(replay.status()).toBe(400);
});
