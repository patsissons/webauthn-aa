/** Base64url <-> bytes helpers (Node Buffer-backed; used server-side). */
export function bytesToB64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

// Returns an ArrayBuffer-backed Uint8Array so it satisfies @simplewebauthn's
// strict `Uint8Array<ArrayBuffer>` parameter types under TS 5.7+ generics.
export function b64uToBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(b64u, "base64url");
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}
