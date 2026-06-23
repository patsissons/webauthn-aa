import { z } from "zod";

/**
 * Envelope encryption shapes (doc A.9). The browser generates a random
 * AES-256-GCM content key, encrypts the evidence, then wraps the content key
 * to the AA's single-use RSA-OAEP-256 public key. Everything is base64url.
 */

/** The plaintext the browser encrypts (never seen by the RP). */
export const evidencePlaintextSchema = z.object({
  photo: z.string(), // base64url data URL or raw base64url image bytes
  claimedName: z.string().min(1),
  claimedBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date
});
export type EvidencePlaintext = z.infer<typeof evidencePlaintextSchema>;

/** What the browser posts to the RP (which relays to the AA transform). */
export const evidenceEnvelopeSchema = z.object({
  materialId: z.string(),
  nonce: z.string(),
  /** AES-GCM ciphertext of the JSON-encoded EvidencePlaintext. */
  ciphertext: z.string(),
  /** AES-GCM IV. */
  iv: z.string(),
  /** RSA-OAEP-wrapped AES content key. */
  wrappedKey: z.string(),
});
export type EvidenceEnvelope = z.infer<typeof evidenceEnvelopeSchema>;
