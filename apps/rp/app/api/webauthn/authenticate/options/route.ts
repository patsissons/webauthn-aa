import { NextResponse } from "next/server";
import { buildAuthenticationOptions } from "@/lib/webauthn";
import { createAuthChallenge } from "@/lib/challenges";

export const runtime = "nodejs";

export async function POST() {
  const options = await buildAuthenticationOptions();
  const challenge = await createAuthChallenge(options.challenge);
  return NextResponse.json({ challengeId: challenge.id, options });
}
