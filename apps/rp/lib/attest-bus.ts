import "server-only";
import { EventEmitter } from "node:events";

// In-process pub/sub so the inbound decision webhook can wake an open attestation
// status stream (keyed by requestId) — no server-side polling of the AA.
const g = globalThis as unknown as { __rpAttestBus?: EventEmitter };
const bus = (g.__rpAttestBus ??= new EventEmitter());
bus.setMaxListeners(0);

const key = (requestId: string) => `req:${requestId}`;

export function emitDecision(requestId: string): void {
  bus.emit(key(requestId));
}

export function onDecision(requestId: string, cb: () => void): () => void {
  bus.on(key(requestId), cb);
  return () => bus.off(key(requestId), cb);
}
