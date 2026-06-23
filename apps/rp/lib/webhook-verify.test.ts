import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature } from "./webhook-verify";

describe("HMAC webhook verification", () => {
  const secret = "shared-webhook-secret";
  const body = JSON.stringify({ event: "revoked", attestationId: "att_1", occurredAt: "2026-06-23T00:00:00Z" });

  it("verifies a correctly signed body", () => {
    const sig = signWebhookBody(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signWebhookBody(body, secret);
    expect(verifyWebhookSignature(body + " ", sig, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = signWebhookBody(body, "other-secret");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });

  it("rejects a missing/garbage signature", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
    expect(verifyWebhookSignature(body, "deadbeef", secret)).toBe(false);
  });

  it("matches a known hex HMAC-SHA256 vector", () => {
    // echo -n "hello" | openssl dgst -sha256 -hmac "key"
    expect(signWebhookBody("hello", "key")).toBe(
      "9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b",
    );
  });
});
