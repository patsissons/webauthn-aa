import { NextResponse } from "next/server";
import { ageFromBirthDate } from "@webauthn-aa/constraints";
import { authenticateRp } from "@/lib/auth";
import { getRequest } from "@/lib/requests";
import { getAttestationByRequest } from "@/lib/attestations";
import { scopeAttributes } from "@/lib/scope";

export const runtime = "nodejs";

// GET /v1/transform/:requestId — client-driven status poll (doc decision).
// Returns quickly: pending | rejected | approved (with scoped attributes + ttl).
export async function GET(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const client = await authenticateRp(req);
  if (!client) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { requestId } = await params;
  const request = await getRequest(requestId);
  if (!request || request.rpClientId !== client.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (request.status === "pending") return NextResponse.json({ status: "pending" });
  if (request.status === "rejected") return NextResponse.json({ status: "rejected" });

  const attestation = await getAttestationByRequest(requestId);
  if (!attestation || attestation.status !== "active") {
    // Approved request without an active attestation — treat as not-yet-ready.
    return NextResponse.json({ status: "pending" });
  }

  const age = ageFromBirthDate(attestation.attestedBirthDate);
  const requested = Array.isArray(request.requestedAttributes) ? request.requestedAttributes : [];
  const attributes = scopeAttributes(requested, client.allowedAttributes, {
    name: attestation.attestedName,
    age,
  });
  const ttl = Math.max(0, new Date(attestation.expiresAt).getTime() - Date.now());

  return NextResponse.json({
    status: "approved",
    attestationId: attestation.id,
    attributes,
    ttl,
  });
}
