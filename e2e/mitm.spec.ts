import { test, expect } from "@playwright/test";
import { AA_URL, RP_TOKEN, bearer } from "./support/aa";

const RP_URL = "http://localhost:3000";
const AA_ORIGIN = process.env.NEXT_PUBLIC_AA_ORIGIN ?? "http://localhost:3001";

// The RP must not be the key-distribution channel: a malicious RP that handed
// the browser its own key could decrypt the evidence. So /api/attest/material
// returns only an opaque materialId — no key, no nonce.
test("RP relays only an opaque materialId, never the encryption key", async ({ request }) => {
  const res = await request.post(`${RP_URL}/api/attest/material`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.materialId).toBeTruthy();
  expect(body).not.toHaveProperty("publicKeyJwk");
  expect(body).not.toHaveProperty("privateKeyJwk");
  expect(body).not.toHaveProperty("nonce");
});

// The browser fetches the genuine public key directly from the AA (CORS-enabled),
// and the AA never exposes the private key.
test("AA serves the public key directly (CORS), never the private key", async ({ request }) => {
  test.skip(!RP_TOKEN, "ATTESTATION_API_AUTH_TOKEN not loaded");
  const mat = await (
    await request.post(`${AA_URL}/api/v1/encryption-material`, { headers: bearer() })
  ).json();

  const direct = await request.get(`${AA_URL}/api/v1/encryption-material/${mat.materialId}`);
  expect(direct.ok()).toBeTruthy();
  expect(direct.headers()["access-control-allow-origin"]).toBe("*");

  const body = await direct.json();
  expect(body.publicKeyJwk).toBeTruthy();
  expect(body.nonce).toBeTruthy();
  expect(body).not.toHaveProperty("privateKeyJwk");
});

// Evidence capture happens in a popup on the AA origin — the RP page cannot
// script into it (same-origin policy), so plaintext never exists in RP context.
test("evidence is captured on the AA origin, not the RP", async ({ page }) => {
  await page.goto(RP_URL);
  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("start-capture").click();
  const popup = await popupPromise;

  await popup.waitForURL(/\/capture/);
  expect(new URL(popup.url()).origin).toBe(AA_ORIGIN);
  await expect(popup.getByTestId("claimed-name")).toBeVisible();
});
