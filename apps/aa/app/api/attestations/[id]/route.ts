import { NextResponse } from "next/server";
import { ageFromBirthDate } from "@webauthn-aa/constraints";
import { getAttestation } from "@/lib/attestations";

export const runtime = "nodejs";

// GET /api/attestations/:id — full audit detail for the reviewer UI (internal).
// The AA holds the PII, so it can surface the attested fields + computed age;
// the evidence photo loads via the linked request's evidence endpoint.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const att = await getAttestation(id);
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });

  let age: number | null;
  try {
    age = att.attestedBirthDate ? ageFromBirthDate(att.attestedBirthDate) : null;
  } catch {
    age = null;
  }

  return NextResponse.json({
    id: att.id,
    requestId: att.requestId,
    attestedName: att.attestedName,
    attestedBirthDate: att.attestedBirthDate,
    age,
    status: att.status,
    issuedAt: att.issuedAt,
    expiresAt: att.expiresAt,
    revokedAt: att.revokedAt,
    revokedReason: att.revokedReason,
  });
}
