/**
 * Envelope encryption (doc A.9), isomorphic WebCrypto so it runs in Node (AA
 * decrypt + tests) and could run in a browser. The browser seals evidence with
 * the AA's single-use RSA-OAEP-256 public key; only the AA, holding the private
 * key, can open it.
 *
 * Scheme:
 *   - random AES-256-GCM content key encrypts JSON(evidence) with a 12-byte IV
 *   - the raw content key is wrapped (RSA-OAEP-256 encrypt) to the AA public key
 *   - ciphertext, iv, wrappedKey are transported as base64url
 */
import type { EvidenceEnvelope, EvidencePlaintext } from "@webauthn-aa/contracts";

const subtle = globalThis.crypto.subtle;

function bytesToB64u(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin =
    typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export async function generateMaterialKeypair(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}> {
  const pair = await subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    subtle.exportKey("jwk", pair.publicKey),
    subtle.exportKey("jwk", pair.privateKey),
  ]);
  return { publicKeyJwk, privateKeyJwk };
}

/** Browser-side reference implementation; also used by the round-trip test. */
export async function sealEvidence(
  publicKeyJwk: JsonWebKey,
  plaintext: EvidencePlaintext,
): Promise<Pick<EvidenceEnvelope, "ciphertext" | "iv" | "wrappedKey">> {
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
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded),
  );
  const rawKey = new Uint8Array(await subtle.exportKey("raw", aesKey));
  const wrappedKey = new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, rsaPub, rawKey));
  return {
    ciphertext: bytesToB64u(ciphertext),
    iv: bytesToB64u(iv),
    wrappedKey: bytesToB64u(wrappedKey),
  };
}

export async function openEvidence(
  privateKeyJwk: JsonWebKey,
  envelope: Pick<EvidenceEnvelope, "ciphertext" | "iv" | "wrappedKey">,
): Promise<EvidencePlaintext> {
  const rsaPriv = await subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const rawKey = await subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPriv,
    b64uToBytes(envelope.wrappedKey),
  );
  const aesKey = await subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintextBytes = await subtle.decrypt(
    { name: "AES-GCM", iv: b64uToBytes(envelope.iv) },
    aesKey,
    b64uToBytes(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintextBytes)) as EvidencePlaintext;
}

export { bytesToB64u, b64uToBytes };
