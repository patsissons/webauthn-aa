/**
 * Single-use, ceremony-bound encryption material validation (doc A.9/A.13).
 * Material is rejected if missing, already spent, expired, or if the supplied
 * nonce does not echo the one issued — preventing replay into a different
 * registration.
 */
export interface MaterialRecordLike {
  nonce: string;
  usedAt?: string | null;
  expiresAt: string;
}

export function validateMaterial(args: {
  material: MaterialRecordLike | null;
  nonce: string;
  now: Date;
}): { ok: boolean; reason?: string } {
  const { material, nonce, now } = args;
  if (!material) return { ok: false, reason: "unknown material" };
  if (material.usedAt) return { ok: false, reason: "material already used" };
  if (new Date(material.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "material expired" };
  }
  if (material.nonce !== nonce) return { ok: false, reason: "nonce mismatch" };
  return { ok: true };
}
