import { z } from "zod";

/**
 * Outbound revocation webhook (doc A.8 / A.12). The AA signs the raw body with
 * HMAC-SHA256 using the per-RP webhookSecret; the RP verifies before acting.
 */

export const WEBHOOK_SIGNATURE_HEADER = "x-aa-signature";
export const WEBHOOK_EVENT_HEADER = "x-aa-event";

export const revocationWebhookSchema = z.object({
  event: z.literal("revoked"),
  attestationId: z.string(),
  occurredAt: z.string(), // ISO timestamp
});
export type RevocationWebhook = z.infer<typeof revocationWebhookSchema>;
