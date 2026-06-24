import { NextResponse } from "next/server";
import { listAttestations, summarizeAttestation } from "@/lib/attestations";

export const runtime = "nodejs";

// GET /api/attestations/list — snapshot (used by API tests; the UI consumes
// /api/attestations/events instead).
export async function GET() {
  const rows = await listAttestations();
  return NextResponse.json({ attestations: rows.map(summarizeAttestation) });
}
