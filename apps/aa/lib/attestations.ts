import "server-only";
import type { RecordModel } from "pocketbase";
import { getPb } from "./pb";

export async function createAttestation(input: {
  requestId: string;
  rpClientId: string;
  attestedName: string;
  attestedBirthDate: string; // stays at the AA; never returned to the RP
  issuedAt: string;
  expiresAt: string;
}): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("attestations").create({ ...input, status: "active" });
}

export async function getAttestation(id: string): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb.collection("attestations").getOne(id).catch(() => null);
}

export async function getAttestationByRequest(requestId: string): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb
    .collection("attestations")
    .getFirstListItem(pb.filter("requestId = {:r}", { r: requestId }))
    .catch(() => null);
}

export async function listAttestations(): Promise<RecordModel[]> {
  const pb = await getPb();
  return pb.collection("attestations").getFullList({ sort: "-created" });
}

export async function revokeAttestation(
  id: string,
  reason: string,
): Promise<RecordModel | null> {
  const pb = await getPb();
  const att = await pb.collection("attestations").getOne(id).catch(() => null);
  if (!att) return null;
  if (att.status === "revoked") return att;
  return pb.collection("attestations").update(id, {
    status: "revoked",
    revokedAt: new Date().toISOString(),
    revokedReason: reason,
  });
}
