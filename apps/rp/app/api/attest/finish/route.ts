import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyRegistration } from "@/lib/webauthn";
import { getPendingRegistration, consumePendingRegistration } from "@/lib/challenges";
import { saveCredential } from "@/lib/credentials";
import { credentialRecordFromRegistration } from "@/lib/credential-record";
import { resolveRegion } from "@/lib/regions";

export const runtime = "nodejs";

const bodySchema = z.object({
  pendingRegId: z.string(),
  response: z.record(z.string(), z.unknown()),
  demoRegion: z.string().optional(),
});

// POST /api/attest/finish — verify the WebAuthn credential and persist it bound
// to the attestation. The passkey is always created (registration proves
// identity); whether the user is authorized NOW is a separate verdict against
// the selected region's constraint.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const pending = await getPendingRegistration(parsed.data.pendingRegId);
  if (!pending || pending.status !== "pending") {
    return NextResponse.json({ error: "registration not pending" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistration({
      response: parsed.data.response as never,
      expectedChallenge: pending.webauthnChallenge,
    });
  } catch {
    return NextResponse.json({ verified: false, error: "verification failed" }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ verified: false }, { status: 400 });
  }

  const record = credentialRecordFromRegistration(verification.registrationInfo.credential, {
    displayName: pending.attestedName || "User",
    userHandle: pending.userHandle,
    satisfiedConstraints: pending.satisfiedConstraints ?? [],
    attestationId: pending.attestationId || undefined,
    attestationExpiresAt: pending.attestationExpiresAt || undefined,
  });

  try {
    await saveCredential(record);
  } catch {
    return NextResponse.json({ error: "credential already registered" }, { status: 409 });
  }
  await consumePendingRegistration(pending.id);

  // Eligibility verdict for the selected region (passkey exists regardless).
  const region = resolveRegion({ demoOverride: parsed.data.demoRegion });
  const authorized = record.satisfiedConstraints.includes(region.constraintSetId);

  return NextResponse.json({
    verified: true,
    authorized,
    reason: authorized ? undefined : "constraint not satisfied",
    displayName: record.displayName,
    satisfiedConstraints: record.satisfiedConstraints,
    region: { id: region.id, label: region.label },
  });
}
