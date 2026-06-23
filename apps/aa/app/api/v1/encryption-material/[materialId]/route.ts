import { NextResponse } from "next/server";
import { getMaterial } from "@/lib/material";

export const runtime = "nodejs";

// Public, CORS-enabled lookup of a ceremony's PUBLIC key material by id. The
// browser fetches this DIRECTLY from the AA (TLS-authenticated) instead of
// trusting a key relayed by the RP — closing the RP key-substitution MITM
// (a malicious RP can no longer hand the device its own key to harvest evidence).
//
// The payload is non-secret (a public key + a single-use nonce), so the private
// key is never exposed and the endpoint needs no bearer. The materialId is only
// useful to the holder of the RP bearer token at the transform step.
const CORS = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "access-control-allow-methods": "GET, OPTIONS" },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;
  const rec = await getMaterial(materialId);
  if (!rec) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: CORS });
  }
  return NextResponse.json(
    { publicKeyJwk: rec.publicKeyJwk, nonce: rec.nonce, expiresAt: rec.expiresAt },
    { headers: CORS },
  );
}
