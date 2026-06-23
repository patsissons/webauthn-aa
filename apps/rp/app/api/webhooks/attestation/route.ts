import { NextResponse } from "next/server";
import { revocationWebhookSchema, WEBHOOK_SIGNATURE_HEADER } from "@webauthn-aa/contracts";
import { rpEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { invalidateCredentialsByAttestation } from "@/lib/webhooks";
import { emitSession } from "@/lib/session-bus";

export const runtime = "nodejs";

// POST /api/webhooks/attestation — inbound AA webhook. Verify HMAC over the raw
// body, then invalidate matching bindings on revocation.
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER) ?? "";
  if (!verifyWebhookSignature(body, signature, rpEnv.rpWebhookSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const parsed = revocationWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "unsupported event" }, { status: 400 });
  }

  const credentialIds = await invalidateCredentialsByAttestation(parsed.data.attestationId);
  // Push a real-time logout to any open session stream for these credentials.
  for (const credentialId of credentialIds) {
    emitSession(credentialId, { type: "revoked", attestationId: parsed.data.attestationId });
  }
  return NextResponse.json({ ok: true, invalidated: credentialIds.length });
}
