/**
 * Per-RP attribute scope enforcement (doc A.4). The AA rejects any transform
 * whose requested attributes are not a subset of the token's allowedAttributes,
 * and only ever returns attributes within (requested ∩ allowed). Date of birth
 * is never an attribute — `age` is derived at the AA and DOB stays here.
 */
export function checkScope(
  requested: string[],
  allowed: string[],
): { ok: boolean; missing: string[] } {
  const missing = requested.filter((a) => !allowed.includes(a));
  return { ok: missing.length === 0, missing };
}

export interface DerivableAttributes {
  name?: string;
  age?: number;
}

export function scopeAttributes(
  requested: string[],
  allowed: string[],
  source: DerivableAttributes,
): { name?: string; age?: number } {
  const grant = new Set(requested.filter((a) => allowed.includes(a)));
  const out: { name?: string; age?: number } = {};
  if (grant.has("name") && source.name !== undefined) out.name = source.name;
  if (grant.has("age") && source.age !== undefined) out.age = source.age;
  return out;
}
