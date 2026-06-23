import "server-only";
import type { RecordModel } from "pocketbase";
import { getPb } from "./pb";
import { b64uToBytes } from "./crypto";

/** Create a review-queue request, storing the decrypted photo as a PB file. */
export async function createRequest(input: {
  rpClientId: string;
  claimedName: string;
  claimedBirthDate: string;
  requestedAttributes: string[];
  photoDataUrl: string; // data URL or base64url image payload
}): Promise<RecordModel> {
  const pb = await getPb();
  const { bytes, mime } = decodePhoto(input.photoDataUrl);
  const file = new File([bytes], "evidence", { type: mime });

  const form = new FormData();
  form.set("rpClientId", input.rpClientId);
  form.set("status", "pending");
  form.set("claimedName", input.claimedName);
  form.set("claimedBirthDate", input.claimedBirthDate);
  form.set("requestedAttributes", JSON.stringify(input.requestedAttributes));
  form.set("evidenceImage", file);
  return pb.collection("attestation_requests").create(form);
}

function decodePhoto(dataUrl: string): { bytes: Uint8Array<ArrayBuffer>; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (m) {
    const buf = Buffer.from(m[2], "base64");
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    return { bytes, mime: m[1] };
  }
  // Fall back to a raw base64url payload with unknown type.
  return { bytes: b64uToBytes(dataUrl), mime: "application/octet-stream" };
}

export async function getRequest(id: string): Promise<RecordModel | null> {
  const pb = await getPb();
  return pb
    .collection("attestation_requests")
    .getOne(id)
    .catch(() => null);
}

export async function listRequests(status?: string): Promise<RecordModel[]> {
  const pb = await getPb();
  const filter = status ? pb.filter("status = {:s}", { s: status }) : "";
  return pb.collection("attestation_requests").getFullList({ sort: "-created", filter });
}

export async function updateReviewFields(
  id: string,
  fields: { reviewedName?: string; reviewedBirthDate?: string },
): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("attestation_requests").update(id, fields);
}

export async function decideRequest(
  id: string,
  decision: "approved" | "rejected",
  fields: { reviewedName?: string; reviewedBirthDate?: string; decidedBy: string },
): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("attestation_requests").update(id, {
    status: decision,
    reviewedName: fields.reviewedName,
    reviewedBirthDate: fields.reviewedBirthDate,
    decidedBy: fields.decidedBy,
    decidedAt: new Date().toISOString(),
  });
}

/** Fetch the decrypted evidence image bytes via a short-lived PB file token. */
export async function getEvidenceImage(
  id: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const pb = await getPb();
  const rec = await pb
    .collection("attestation_requests")
    .getOne(id)
    .catch(() => null);
  if (!rec || !rec.evidenceImage) return null;
  const token = await pb.files.getToken();
  const url = pb.files.getURL(rec, rec.evidenceImage as string, { token });
  const res = await fetch(url);
  if (!res.ok) return null;
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
