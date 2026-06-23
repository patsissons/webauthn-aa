import { NextResponse } from "next/server";
import { z } from "zod";
import { submitTransform } from "@/lib/aa-client";
import { rpEnv } from "@/lib/env";

export const runtime = "nodejs";

const bodySchema = z.object({
  materialId: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
  iv: z.string(),
  wrappedKey: z.string(),
});

// POST /api/attest/submit — relay the ciphertext envelope to the AA transform.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid envelope" }, { status: 400 });
  }
  try {
    const { requestId } = await submitTransform({
      ...parsed.data,
      requestedAttributes: rpEnv.attestationRequestedAttributes,
    });
    return NextResponse.json({ requestId });
  } catch {
    // Fail-closed: any AA error denies.
    return NextResponse.json({ error: "attestation submission failed" }, { status: 502 });
  }
}
