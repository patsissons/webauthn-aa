import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthentication } from "@/lib/webauthn";
import { getAuthChallenge, deleteAuthChallenge } from "@/lib/challenges";
import { findCredentialByCredentialId, updateCredentialCounter } from "@/lib/credentials";

export const runtime = "nodejs";

const bodySchema = z.object({
  challengeId: z.string(),
  response: z.object({ id: z.string() }).passthrough(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const challenge = await getAuthChallenge(parsed.data.challengeId);
  if (!challenge) {
    return NextResponse.json({ error: "unknown challenge" }, { status: 400 });
  }

  const credential = await findCredentialByCredentialId(parsed.data.response.id);
  if (!credential) {
    await deleteAuthChallenge(parsed.data.challengeId);
    return NextResponse.json({ verified: false, error: "unknown credential" }, { status: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthentication({
      response: parsed.data.response as never,
      expectedChallenge: challenge.challenge,
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKey,
        counter: credential.counter ?? 0,
        transports: credential.transports ?? [],
      },
    });
  } catch {
    await deleteAuthChallenge(parsed.data.challengeId);
    return NextResponse.json({ verified: false, error: "verification failed" }, { status: 401 });
  }

  await deleteAuthChallenge(parsed.data.challengeId);
  if (!verification.verified) {
    return NextResponse.json({ verified: false }, { status: 401 });
  }
  await updateCredentialCounter(credential.id, verification.authenticationInfo.newCounter);

  return NextResponse.json({ verified: true, displayName: credential.displayName });
}
