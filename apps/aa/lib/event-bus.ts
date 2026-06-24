import "server-only";
import { EventEmitter } from "node:events";

// In-process pub/sub so AA mutation routes can notify open reviewer SSE streams
// (review queue, attestation browser) without the browser polling. Every change
// to these collections flows through an AA route, so an in-process bus captures
// them all. (A multi-instance deploy would use PocketBase realtime / a broker.)
const g = globalThis as unknown as { __aaEventBus?: EventEmitter };
const bus = (g.__aaEventBus ??= new EventEmitter());
bus.setMaxListeners(0);

export type AaTopic = "requests" | "attestations";

export function emitChange(topic: AaTopic): void {
  bus.emit(topic);
}

export function onChange(topic: AaTopic, cb: () => void): () => void {
  bus.on(topic, cb);
  return () => bus.off(topic, cb);
}
