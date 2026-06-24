import "server-only";
import { randomBytes } from "node:crypto";
import { getTransformStatus } from "./aa-client";
import { evaluateAllRegions, resolveRegion } from "./regions";
import { buildRegistrationOptions } from "./webauthn";
import { createPendingRegistration } from "./challenges";
import { bytesToB64u } from "./encoding";

export type AttestStatus =
  | { status: "pending" }
  | { status: "rejected" }
  | {
      status: "approved";
      pendingRegId: string;
      options: unknown;
      displayName: string;
      satisfiedConstraints: string[];
      region: { id: string; label: string; constraintSetId: string };
    };

/**
 * Resolve the current attestation status for a request. On AA approval, the
 * passkey is ALWAYS issued — registration proves identity and is decoupled from
 * the age policy (doc A.7 revisited). We evaluate every region against the
 * attested age and store the resulting satisfiedConstraints snapshot, but the
 * eligibility decision happens at authorization time (now and, via lazy AA
 * refresh, as the device ages). Throws on AA error so callers fail closed.
 */
export async function resolveAttestStatus(args: {
  requestId: string;
  demoRegion?: string;
}): Promise<AttestStatus> {
  const status = await getTransformStatus(args.requestId);

  if (status.status === "pending") return { status: "pending" };
  if (status.status === "rejected") return { status: "rejected" };

  const age = status.attributes.age;
  const name = status.attributes.name ?? "User";
  const satisfiedConstraints = evaluateAllRegions({ age });
  const region = resolveRegion({ demoOverride: args.demoRegion });

  const userHandle = bytesToB64u(new Uint8Array(randomBytes(16)));
  const options = await buildRegistrationOptions({ userHandle, userName: name });
  const attestationExpiresAt = new Date(Date.now() + status.ttl).toISOString();
  const pending = await createPendingRegistration({
    userHandle,
    challenge: options.challenge,
    displayName: name,
    regionId: region.id,
    satisfiedConstraints,
    attestationId: status.attestationId,
    attestedName: name,
    attestationExpiresAt,
  });

  return {
    status: "approved",
    pendingRegId: pending.id,
    options,
    displayName: name,
    satisfiedConstraints,
    region,
  };
}
