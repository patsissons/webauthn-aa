export const AA_URL = process.env.AA_ORIGIN ?? "http://localhost:3001";

export const RP_TOKEN = process.env.ATTESTATION_API_AUTH_TOKEN ?? "";

export function bearer(token: string = RP_TOKEN) {
  return { authorization: `Bearer ${token}` };
}

// A minimal valid 1x1 PNG as a data URL, used as evidence in API-level tests.
export const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
