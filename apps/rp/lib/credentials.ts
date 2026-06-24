import "server-only";
import type { RecordModel } from "pocketbase";
import { getPb } from "./pb";
import type { CredentialRecord } from "./credential-record";

export async function saveCredential(record: CredentialRecord): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("credentials").create(record);
}

export async function findCredentialByCredentialId(
  credentialId: string,
): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb
    .collection("credentials")
    .getFirstListItem(pb.filter("credentialId = {:id}", { id: credentialId }))
    .catch(() => null);
}

export async function updateCredentialCounter(id: string, counter: number): Promise<void> {
  const pb = await getPb();
  await pb.collection("credentials").update(id, { counter });
}

export async function updateCredentialEligibility(
  id: string,
  fields: {
    satisfiedConstraints?: string[];
    attestationExpiresAt?: string;
    attestationStatus?: "active" | "revoked" | "expired";
  },
): Promise<void> {
  const pb = await getPb();
  await pb.collection("credentials").update(id, fields);
}
