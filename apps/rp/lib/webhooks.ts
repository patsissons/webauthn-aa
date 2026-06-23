import "server-only";
import { getPb } from "./pb";

/**
 * Invalidate every binding carrying a revoked attestationId (doc A.8/A.10) and
 * return the affected credentialIds so the caller can push a real-time logout.
 */
export async function invalidateCredentialsByAttestation(attestationId: string): Promise<string[]> {
  if (!attestationId) return [];
  const pb = await getPb();
  const rows = await pb
    .collection("credentials")
    .getFullList({ filter: pb.filter("attestationId = {:a}", { a: attestationId }) })
    .catch(() => []);
  const credentialIds: string[] = [];
  for (const r of rows) {
    await pb.collection("credentials").update(r.id, { attestationStatus: "revoked" });
    credentialIds.push(r.credentialId as string);
  }
  return credentialIds;
}
