import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authenticateRp } from "@/lib/auth";
import { generateMaterialKeypair } from "@/lib/crypto";
import { createMaterial } from "@/lib/material";
import { aaEnv } from "@/lib/env";

export const runtime = "nodejs";

// POST /v1/encryption-material — issue single-use, ceremony-bound material.
export async function POST(req: Request) {
  const client = await authenticateRp(req);
  if (!client) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { publicKeyJwk, privateKeyJwk } = await generateMaterialKeypair();
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + aaEnv.encryptionMaterialTtlMs).toISOString();

  const rec = await createMaterial({
    publicKeyJwk,
    privateKeyJwk,
    nonce,
    rpClientId: client.id,
    expiresAt,
  });

  return NextResponse.json({ materialId: rec.id, publicKeyJwk, nonce, expiresAt });
}
