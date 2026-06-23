import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { buildRegistrationOptions } from "@/lib/webauthn";
import { createPendingRegistration } from "@/lib/challenges";
import { bytesToB64u } from "@/lib/encoding";

export const runtime = "nodejs";

const bodySchema = z.object({ displayName: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }
  const userHandle = bytesToB64u(new Uint8Array(randomBytes(16)));
  const options = await buildRegistrationOptions({
    userHandle,
    userName: parsed.data.displayName,
  });
  const pending = await createPendingRegistration({
    userHandle,
    challenge: options.challenge,
    displayName: parsed.data.displayName,
  });
  return NextResponse.json({ pendingRegId: pending.id, options });
}
