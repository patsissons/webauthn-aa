import { NextResponse } from "next/server";
import { listAttestations } from "@/lib/attestations";

export const runtime = "nodejs";

// GET /api/attestations/list — attestation browser (internal, local demo).
export async function GET() {
  const rows = await listAttestations();
  return NextResponse.json({
    attestations: rows.map((a) => ({
      id: a.id,
      attestedName: a.attestedName,
      status: a.status,
      issuedAt: a.issuedAt,
      expiresAt: a.expiresAt,
      revokedAt: a.revokedAt,
    })),
  });
}
