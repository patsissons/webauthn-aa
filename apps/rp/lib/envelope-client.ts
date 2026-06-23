/**
 * Browser-side envelope encryption (doc A.9). Mirrors the AA's open/seal scheme
 * exactly: random AES-256-GCM content key encrypts JSON(evidence); the raw key
 * is wrapped (RSA-OAEP-256) to the AA's single-use public key. WebCrypto only —
 * no crypto dependencies in the browser.
 */
import type { EvidenceEnvelope, EvidencePlaintext } from "@webauthn-aa/contracts";

function bytesToB64u(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sealEvidence(
  publicKeyJwk: JsonWebKey,
  plaintext: EvidencePlaintext,
): Promise<Pick<EvidenceEnvelope, "ciphertext" | "iv" | "wrappedKey">> {
  const subtle = window.crypto.subtle;
  const rsaPub = await subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded));
  const rawKey = new Uint8Array(await subtle.exportKey("raw", aesKey));
  const wrappedKey = new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, rsaPub, rawKey));
  return {
    ciphertext: bytesToB64u(ciphertext),
    iv: bytesToB64u(iv),
    wrappedKey: bytesToB64u(wrappedKey),
  };
}
