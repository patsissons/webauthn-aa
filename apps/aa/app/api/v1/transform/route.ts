import { NextResponse } from "next/server";
import { transformRequestSchema } from "@webauthn-aa/contracts";
import { authenticateRp } from "@/lib/auth";
import { checkScope } from "@/lib/scope";
import { validateMaterial } from "@/lib/material-validation";
import { getMaterial, markMaterialUsed } from "@/lib/material";
import { openEvidence } from "@/lib/crypto";
import { createRequest } from "@/lib/requests";

export const runtime = "nodejs";

// POST /v1/transform — submit envelope-encrypted evidence; decrypts, enforces
// scope, enqueues a review request. Returns quickly with a requestId.
export async function POST(req: Request) {
  const client = await authenticateRp(req);
  if (!client) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = transformRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid transform request" }, { status: 400 });
  }
  const body = parsed.data;

  const scope = checkScope(body.requestedAttributes, client.allowedAttributes);
  if (!scope.ok) {
    return NextResponse.json(
      { error: `requested attributes out of scope: ${scope.missing.join(", ")}` },
      { status: 403 },
    );
  }

  const material = await getMaterial(body.materialId);
  if (material && material.rpClientId !== client.id) {
    return NextResponse.json({ error: "material does not belong to client" }, { status: 403 });
  }
  const check = validateMaterial({
    material: material
      ? { nonce: material.nonce, usedAt: material.usedAt, expiresAt: material.expiresAt }
      : null,
    nonce: body.nonce,
    now: new Date(),
  });
  if (!check.ok || !material) {
    return NextResponse.json({ error: check.reason ?? "invalid material" }, { status: 400 });
  }

  // Single-use: consume the material before decrypting (fail-closed on replay).
  await markMaterialUsed(material.id);

  let evidence;
  try {
    evidence = await openEvidence(material.privateKeyJwk as JsonWebKey, {
      ciphertext: body.ciphertext,
      iv: body.iv,
      wrappedKey: body.wrappedKey,
    });
  } catch {
    return NextResponse.json({ error: "could not decrypt evidence" }, { status: 400 });
  }

  const request = await createRequest({
    rpClientId: client.id,
    claimedName: evidence.claimedName,
    claimedBirthDate: evidence.claimedBirthDate,
    requestedAttributes: body.requestedAttributes,
    photoDataUrl: evidence.photo,
  });

  return NextResponse.json({ requestId: request.id, status: "pending" });
}
