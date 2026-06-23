import { NextResponse } from "next/server";
import { requestEncryptionMaterial } from "@/lib/aa-client";

export const runtime = "nodejs";

// POST /api/attest/material — RP brokers single-use material from the AA and
// returns the public key + nonce to the browser for envelope encryption.
export async function POST() {
  try {
    const material = await requestEncryptionMaterial();
    return NextResponse.json(material);
  } catch {
    return NextResponse.json({ error: "attestation authority unavailable" }, { status: 502 });
  }
}
