import { NextResponse } from "next/server";
import { ageFromBirthDate } from "@webauthn-aa/constraints";
import { authenticateRp } from "@/lib/auth";
import { getAttestation } from "@/lib/attestations";
import { scopeAttributes } from "@/lib/scope";

export const runtime = "nodejs";

// GET /v1/attestations/:attestationId (RP token) — recompute current eligibility
// for an existing attestation. The AA still holds the date of birth (for audit /
// revocation), so it recomputes today's `age` here; the DOB never leaves the AA.
// Lets the RP re-evaluate its constraints over time without re-attestation and
// without ever storing a DOB. Returns active|revoked|expired + scoped attributes.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ attestationId: string }> },
) {
  const client = await authenticateRp(req);
  if (!client) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { attestationId } = await params;
  const att = await getAttestation(attestationId);
  if (!att || att.rpClientId !== client.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (att.status === "revoked") return NextResponse.json({ status: "revoked" });

  const now = Date.now();
  const expiresMs = new Date(att.expiresAt).getTime();
  if (expiresMs <= now) return NextResponse.json({ status: "expired" });

  const age = ageFromBirthDate(att.attestedBirthDate); // recomputed against today
  const attributes = scopeAttributes(client.allowedAttributes, client.allowedAttributes, {
    name: att.attestedName,
    age,
  });
  return NextResponse.json({
    status: "active",
    attestationId,
    attributes,
    ttl: Math.max(0, expiresMs - now),
  });
}
