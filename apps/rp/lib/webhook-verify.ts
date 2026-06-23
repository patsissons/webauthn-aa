import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Inbound webhook authenticity (doc A.9/A.13). The AA signs the raw body with
 * HMAC-SHA256 (hex) using the per-RP webhookSecret; the RP verifies in constant
 * time before acting. Pure (Node crypto) so it is unit-testable.
 */
export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = signWebhookBody(body, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
