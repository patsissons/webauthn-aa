import "server-only";
import type { RecordModel } from "pocketbase";
import { getPb } from "./pb";

export async function createMaterial(input: {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  nonce: string;
  rpClientId: string;
  expiresAt: string;
}): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("encryption_material").create(input);
}

export async function getMaterial(id: string): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb.collection("encryption_material").getOne(id).catch(() => null);
}

export async function markMaterialUsed(id: string): Promise<void> {
  const pb = await getPb();
  await pb.collection("encryption_material").update(id, { usedAt: new Date().toISOString() });
}
