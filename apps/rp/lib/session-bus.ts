import "server-only";
import { EventEmitter } from "node:events";

// In-process pub/sub so the webhook receiver can push a revocation to an open
// session SSE stream in the same Node process. Attached to globalThis so it
// survives dev HMR. (A multi-instance deploy would back this with PB realtime or
// a shared broker; fine for the single-process prototype.)
const g = globalThis as unknown as { __rpSessionBus?: EventEmitter };
const bus = (g.__rpSessionBus ??= new EventEmitter());
bus.setMaxListeners(0);

export type SessionEvent = { type: "revoked" | "expired"; attestationId?: string };

const key = (credentialId: string) => `cred:${credentialId}`;

export function emitSession(credentialId: string, event: SessionEvent): void {
  bus.emit(key(credentialId), event);
}

export function onSession(credentialId: string, cb: (e: SessionEvent) => void): () => void {
  bus.on(key(credentialId), cb);
  return () => bus.off(key(credentialId), cb);
}
