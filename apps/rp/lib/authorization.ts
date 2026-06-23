/**
 * Re-authentication authorization (doc A.7/A.10): a dumb set-membership check
 * against the device's stored satisfiedConstraints — NO constraint
 * recomputation, NO AA call. Also enforces attestation freshness (TTL) and
 * revocation when those inputs are supplied (used from Phase 5).
 */
export function authorizeReauth(args: {
  satisfiedConstraints: string[];
  requiredConstraintSetId: string;
  attestationStatus?: "active" | "revoked" | "expired";
  attestationExpiresAt?: string;
  now?: Date;
}): { authorized: boolean; reason?: string } {
  if (args.attestationStatus === "revoked") {
    return { authorized: false, reason: "revoked" };
  }
  if (args.attestationStatus === "expired") {
    return { authorized: false, reason: "expired" };
  }
  if (args.attestationExpiresAt && args.now) {
    if (new Date(args.attestationExpiresAt).getTime() <= args.now.getTime()) {
      return { authorized: false, reason: "expired" };
    }
  }
  if (!args.satisfiedConstraints.includes(args.requiredConstraintSetId)) {
    return { authorized: false, reason: "constraint not satisfied" };
  }
  return { authorized: true };
}
