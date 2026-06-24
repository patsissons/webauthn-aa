import "server-only";
import type { RecordModel } from "pocketbase";
import type { Region } from "@webauthn-aa/contracts";
import { authorizeReauth } from "./authorization";
import { evaluateAllRegions, isConstraintMonotonic } from "./regions";
import { refreshAttestation } from "./aa-client";
import { updateCredentialEligibility } from "./credentials";

export interface AuthorizeResult {
  authorized: boolean;
  reason?: string;
  satisfiedConstraints: string[];
}

/**
 * Re-auth authorization with lazy AA refresh (doc A.7 revisited):
 *   1. Fast path — a pure set-membership lookup on the cached snapshot, plus
 *      revocation/expiry checks. No AA call (preserves cheap repeat).
 *   2. On a constraint miss only — ask the AA to recompute eligibility from the
 *      DOB it still holds (the device may have aged into the threshold), update
 *      the cached snapshot, and re-check. Fail-closed on AA error.
 * Revoked/expired never trigger a refresh — they route straight to re-attestation.
 */
export async function authorizeWithRefresh(
  credential: RecordModel,
  region: Region,
  now: Date = new Date(),
): Promise<AuthorizeResult> {
  const cached = Array.isArray(credential.satisfiedConstraints)
    ? (credential.satisfiedConstraints as string[])
    : [];

  const fast = authorizeReauth({
    satisfiedConstraints: cached,
    requiredConstraintSetId: region.constraintSetId,
    attestationStatus: credential.attestationStatus,
    attestationExpiresAt: credential.attestationExpiresAt || undefined,
    now,
  });
  // Revoked/expired are terminal — never refresh, route to re-attestation.
  if (!fast.authorized && fast.reason !== "constraint not satisfied") {
    return { authorized: false, reason: fast.reason, satisfiedConstraints: cached };
  }
  // Monotonic constraint already satisfied → trust the cache (age only increases).
  if (fast.authorized && isConstraintMonotonic(region.constraintSetId)) {
    return { authorized: true, satisfiedConstraints: cached };
  }
  // Otherwise — a not-yet-eligible miss, OR a non-monotonic cached pass that could
  // have aged out — recompute against the current age. Without an attestation to
  // refresh, fall back to the cached verdict.
  if (!credential.attestationId) {
    return { authorized: fast.authorized, reason: fast.reason, satisfiedConstraints: cached };
  }

  let fresh;
  try {
    fresh = await refreshAttestation(credential.attestationId as string);
  } catch {
    return { authorized: false, reason: "constraint not satisfied", satisfiedConstraints: cached }; // fail-closed
  }

  if (fresh.status === "revoked") {
    await updateCredentialEligibility(credential.id, { attestationStatus: "revoked" });
    return { authorized: false, reason: "revoked", satisfiedConstraints: cached };
  }
  if (fresh.status === "expired") {
    await updateCredentialEligibility(credential.id, { attestationStatus: "expired" });
    return { authorized: false, reason: "expired", satisfiedConstraints: cached };
  }

  const satisfiedConstraints = evaluateAllRegions({ age: fresh.attributes?.age });
  const attestationExpiresAt = new Date(now.getTime() + (fresh.ttl ?? 0)).toISOString();
  await updateCredentialEligibility(credential.id, {
    satisfiedConstraints,
    attestationExpiresAt,
    attestationStatus: "active",
  });

  const authorized = satisfiedConstraints.includes(region.constraintSetId);
  return {
    authorized,
    reason: authorized ? undefined : "constraint not satisfied",
    satisfiedConstraints,
  };
}
