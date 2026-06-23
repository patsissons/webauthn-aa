import { NextResponse } from "next/server";
import { requestEncryptionMaterial } from "@/lib/aa-client";

export const runtime = "nodejs";

// POST /api/attest/material — RP asks the AA to mint single-use material and
// returns ONLY the opaque materialId to the browser. The browser fetches the
// actual public key + nonce DIRECTLY from the AA (see the AA GET endpoint), so
// the RP server is never the key-distribution channel and cannot substitute its
// own key to man-in-the-middle the evidence.
export async function POST() {
  try {
    const material = await requestEncryptionMaterial();
    return NextResponse.json({ materialId: material.materialId });
  } catch {
    return NextResponse.json({ error: "attestation authority unavailable" }, { status: 502 });
  }
}
