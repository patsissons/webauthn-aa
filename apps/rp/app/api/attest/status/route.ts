import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getTransformStatus } from "@/lib/aa-client";
import { evaluateAllRegions, resolveRegion } from "@/lib/regions";
import { buildRegistrationOptions } from "@/lib/webauthn";
import { createPendingRegistration } from "@/lib/challenges";
import { bytesToB64u } from "@/lib/encoding";

export const runtime = "nodejs";

const bodySchema = z.object({
  requestId: z.string(),
  demoRegion: z.string().optional(),
});

// POST /api/attest/status — client-driven poll. On AA approval, the RP gates on
// the resolved region's constraint, stores satisfiedConstraints, and returns
// WebAuthn creation options. Constraints are evaluated here only (doc A.7).
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  let status;
  try {
    status = await getTransformStatus(parsed.data.requestId);
  } catch {
    return NextResponse.json({ status: "error" }, { status: 502 }); // fail-closed
  }

  if (status.status === "pending") return NextResponse.json({ status: "pending" });
  if (status.status === "rejected") return NextResponse.json({ status: "rejected" });

  // Approved by the AA: evaluate every region, gate on the resolved one.
  const age = status.attributes.age;
  const name = status.attributes.name ?? "User";
  const satisfiedConstraints = evaluateAllRegions({ age });
  const region = resolveRegion({ demoOverride: parsed.data.demoRegion });

  if (!satisfiedConstraints.includes(region.constraintSetId)) {
    return NextResponse.json({ status: "not_eligible", region });
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

  return NextResponse.json({
    status: "approved",
    pendingRegId: pending.id,
    options,
    displayName: name,
    satisfiedConstraints,
    region,
  });
}
