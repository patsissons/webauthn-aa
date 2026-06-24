import { NextResponse } from "next/server";
import { attestationWebhookSchema, WEBHOOK_SIGNATURE_HEADER } from "@webauthn-aa/contracts";
import { rpEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { invalidateCredentialsByAttestation } from "@/lib/webhooks";
import { emitSession } from "@/lib/session-bus";
import { emitDecision } from "@/lib/attest-bus";

export const runtime = "nodejs";

// POST /api/webhooks/attestation — inbound AA webhook. Verify HMAC over the raw
// body, then dispatch: `revoked` invalidates bindings (+ real-time logout);
// `decision` wakes the waiting status stream for that request.
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
  const parsed = attestationWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "unsupported event" }, { status: 400 });
  }

  if (parsed.data.event === "revoked") {
    const credentialIds = await invalidateCredentialsByAttestation(parsed.data.attestationId);
    for (const credentialId of credentialIds) {
      emitSession(credentialId, { type: "revoked", attestationId: parsed.data.attestationId });
    }
    return NextResponse.json({ ok: true, invalidated: credentialIds.length });
  }

  // decision
  emitDecision(parsed.data.requestId);
  return NextResponse.json({ ok: true });
}
