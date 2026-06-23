import { bytesToB64u } from "./encoding";

/**
 * Pure mapping from a verified WebAuthn registration into a `credentials`
 * record. Kept free of server-only imports so it is unit-testable. The record
 * deliberately carries NO photo, NO date of birth, NO government identifier —
 * only the public key, a per-credential display name, and the attestation
 * binding fields (populated for real in Phase 3/4; empty for the stock flow).
 */
export interface VerifiedCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
}

export interface CredentialBindingContext {
  displayName: string;
  userHandle: string;
  satisfiedConstraints?: string[];
  attestationId?: string;
  attestationExpiresAt?: string;
}

export interface CredentialRecord {
  credentialId: string;
  publicKey: string; // base64url
  counter: number;
  transports: string[];
  displayName: string;
  userHandle: string;
  satisfiedConstraints: string[];
  attestationId: string;
  attestationExpiresAt: string;
  attestationStatus: "active" | "revoked" | "expired";
}

export function credentialRecordFromRegistration(
  cred: VerifiedCredential,
  ctx: CredentialBindingContext,
): CredentialRecord {
  return {
    credentialId: cred.id,
    publicKey: bytesToB64u(cred.publicKey),
    counter: cred.counter ?? 0,
    transports: cred.transports ?? [],
    displayName: ctx.displayName,
    userHandle: ctx.userHandle,
    satisfiedConstraints: ctx.satisfiedConstraints ?? [],
    attestationId: ctx.attestationId ?? "",
    attestationExpiresAt: ctx.attestationExpiresAt ?? "",
    attestationStatus: "active",
  };
}
