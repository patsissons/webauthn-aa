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

/**
 * Decision webhook (A.10 / "API supports blocking on async operations"): the AA
 * notifies the RP the moment a reviewer approves or rejects a request, so the RP
 * can resolve its status stream without polling.
 */
export const decisionWebhookSchema = z.object({
  event: z.literal("decision"),
  requestId: z.string(),
  occurredAt: z.string(),
});
export type DecisionWebhook = z.infer<typeof decisionWebhookSchema>;

export const attestationWebhookSchema = z.discriminatedUnion("event", [
  revocationWebhookSchema,
  decisionWebhookSchema,
]);
export type AttestationWebhook = z.infer<typeof attestationWebhookSchema>;
