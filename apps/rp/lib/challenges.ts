import "server-only";
import type { RecordModel } from "pocketbase";
import { getPb } from "./pb";

/** Pending registration ceremony state (doc A.11 `pending_registrations`). */
export async function createPendingRegistration(input: {
  userHandle: string;
  challenge: string;
  displayName: string;
  regionId?: string;
  satisfiedConstraints?: string[];
  attestationId?: string;
  attestedName?: string;
  attestationExpiresAt?: string;
}): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("pending_registrations").create({
    userHandle: input.userHandle,
    webauthnChallenge: input.challenge,
    regionId: input.regionId ?? "",
    satisfiedConstraints: input.satisfiedConstraints ?? [],
    attestationId: input.attestationId ?? "",
    attestedName: input.attestedName ?? input.displayName,
    attestationExpiresAt: input.attestationExpiresAt ?? "",
    status: "pending",
  });
}

export async function getPendingRegistration(id: string): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb
    .collection("pending_registrations")
    .getOne(id)
    .catch(() => null);
}

export async function consumePendingRegistration(id: string): Promise<void> {
  const pb = await getPb();
  await pb.collection("pending_registrations").update(id, { status: "consumed" });
}

/** Authentication challenge state (doc A.11 `auth_challenges`). */
export async function createAuthChallenge(challenge: string): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("auth_challenges").create({ challenge });
}

export async function getAuthChallenge(id: string): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb
    .collection("auth_challenges")
    .getOne(id)
    .catch(() => null);
}

export async function deleteAuthChallenge(id: string): Promise<void> {
  const pb = await getPb();
  await pb
    .collection("auth_challenges")
    .delete(id)
    .catch(() => {});
}
