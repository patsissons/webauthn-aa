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
  | { status: "not_eligible"; region: { id: string; label: string; constraintSetId: string } }
  | {
      status: "approved";
      pendingRegId: string;
      options: unknown;
      displayName: string;
      satisfiedConstraints: string[];
      region: { id: string; label: string; constraintSetId: string };
    };

/**
 * Resolve the current attestation status for a request and, on AA approval,
 * gate on the resolved region's constraint (doc A.7) — evaluating every region,
 * storing satisfiedConstraints, and minting a pending WebAuthn registration.
 * Throws on any AA error so callers can fail closed. Shared by the POST status
 * endpoint and the SSE stream.
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

  if (!satisfiedConstraints.includes(region.constraintSetId)) {
    return { status: "not_eligible", region };
  }

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
