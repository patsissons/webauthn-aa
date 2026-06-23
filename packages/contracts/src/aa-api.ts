import { z } from "zod";
import { evidenceEnvelopeSchema } from "./envelope";

/** AA API contract (doc A.12). All endpoints are RP-bearer authenticated. */

// POST /v1/encryption-material
export const encryptionMaterialResponseSchema = z.object({
  materialId: z.string(),
  publicKeyJwk: z.record(z.string(), z.unknown()),
  nonce: z.string(),
  expiresAt: z.string(), // ISO timestamp
});
export type EncryptionMaterialResponse = z.infer<typeof encryptionMaterialResponseSchema>;

// POST /v1/transform
export const transformRequestSchema = evidenceEnvelopeSchema.extend({
  requestedAttributes: z.array(z.string()).min(1),
});
export type TransformRequest = z.infer<typeof transformRequestSchema>;

export const transformSubmitResponseSchema = z.object({
  requestId: z.string(),
  status: z.literal("pending"),
});
export type TransformSubmitResponse = z.infer<typeof transformSubmitResponseSchema>;

// GET /v1/transform/:requestId  — quick status (client-driven polling, doc decision)
export const attestedAttributesSchema = z.object({
  name: z.string().optional(),
  age: z.number().int().optional(),
});
export type AttestedAttributes = z.infer<typeof attestedAttributesSchema>;

export const transformStatusResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("rejected") }),
  z.object({
    status: z.literal("approved"),
    attestationId: z.string(),
    attributes: attestedAttributesSchema,
    ttl: z.number().int(), // ms remaining lifetime of the attested payload
  }),
]);
export type TransformStatusResponse = z.infer<typeof transformStatusResponseSchema>;

export const TRANSFORM_STATUSES = ["pending", "approved", "rejected"] as const;
