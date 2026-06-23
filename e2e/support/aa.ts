import type { APIRequestContext } from "@playwright/test";

export const AA_URL = process.env.AA_ORIGIN ?? "http://localhost:3001";

export const RP_TOKEN = process.env.ATTESTATION_API_AUTH_TOKEN ?? "";

export function bearer(token: string = RP_TOKEN) {
  return { authorization: `Bearer ${token}` };
}

// A minimal valid 1x1 PNG as a data URL, used as evidence in API-level tests.
export const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const PNG_BUFFER = Buffer.from(TINY_PNG_DATA_URL.split(",")[1], "base64");

/** Reviewer step driven programmatically: approve the pending request by name. */
export async function approvePendingByName(
  request: APIRequestContext,
  claimedName: string,
  attempts = 30,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const list = await (await request.get(`${AA_URL}/api/review/list?status=pending`)).json();
    const match = (list.requests ?? []).find(
      (r: { claimedName: string }) => r.claimedName === claimedName,
    );
    if (match) {
      const res = await request.post(`${AA_URL}/api/review/${match.id}`, {
        data: { action: "approve" },
      });
      if (!res.ok()) throw new Error(`approve failed: ${res.status()}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`pending request for ${claimedName} never appeared`);
}
