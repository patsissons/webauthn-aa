import "server-only";
import { getPb } from "./pb";

/** Invalidate every binding carrying a revoked attestationId (doc A.8/A.10). */
export async function invalidateCredentialsByAttestation(attestationId: string): Promise<number> {
  if (!attestationId) return 0;
  const pb = await getPb();
  const rows = await pb
    .collection("credentials")
    .getFullList({ filter: pb.filter("attestationId = {:a}", { a: attestationId }) })
    .catch(() => []);
  for (const r of rows) {
    await pb.collection("credentials").update(r.id, { attestationStatus: "revoked" });
  }
  return rows.length;
}
