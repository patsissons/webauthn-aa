import { findCredentialByCredentialId } from "@/lib/credentials";
import { onSession, type SessionEvent } from "@/lib/session-bus";

export const runtime = "nodejs";
export const maxDuration = 60;

// On a multi-instance serverless deploy the in-process bus (onSession) only
// catches same-instance revokes, so the stream also polls the credential's status
// (the DB is the shared source of truth) to catch a cross-instance revoke.
const POLL_MS = 3000;

// GET /api/session/events?credentialId=... — per-session SSE. Pushes a single
// `revoked` or `expired` event the moment the device's attestation is
// invalidated (by the revocation webhook) or its TTL lapses, so the client can
// log out immediately. Emits the current state on connect if already invalid.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const credentialId = url.searchParams.get("credentialId");
  if (!credentialId) return new Response("missing credentialId", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const cred = await findCredentialByCredentialId(credentialId);
      if (!cred) {
        send({ type: "unknown" });
        close();
        return;
      }
      if (cred.attestationStatus === "revoked") {
        send({ type: "revoked" });
        close();
        return;
      }

      const finish = (e: SessionEvent) => {
        send(e);
        close();
      };
      const unsub = onSession(credentialId, finish);

      // Cross-instance fallback: poll the credential's status (the bus only
      // catches a same-instance revoke on a serverless deploy).
      const poll = setInterval(async () => {
        if (closed) return;
        const latest = await findCredentialByCredentialId(credentialId).catch(() => null);
        if (latest?.attestationStatus === "revoked") finish({ type: "revoked" });
      }, POLL_MS);

      // TTL freshness: fire `expired` when the attestation lapses (only arm for
      // near-future expiries; far-future ones outlive any session).
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      if (cred.attestationExpiresAt) {
        const ms = new Date(cred.attestationExpiresAt).getTime() - Date.now();
        if (ms <= 0) return finish({ type: "expired" });
        if (ms < 2_000_000_000) expiryTimer = setTimeout(() => finish({ type: "expired" }), ms);
      }

      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      function cleanup() {
        unsub();
        clearInterval(poll);
        if (expiryTimer) clearTimeout(expiryTimer);
        clearInterval(heartbeat);
      }

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
