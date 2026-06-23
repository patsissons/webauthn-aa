import type { ConstraintModule } from "@webauthn-aa/contracts";
import { ageModule } from "./age";

export { ageModule, describeAge } from "./age";

const MODULES: Record<string, ConstraintModule> = {
  [ageModule.id]: ageModule,
};

export function getConstraintModule(id: string): ConstraintModule {
  const mod = MODULES[id];
  if (!mod) throw new Error(`unknown constraint module: ${id}`);
  return mod;
}

/**
 * Compute integer age from an ISO birth date relative to a reference instant.
 * Deterministic given `now` so tests don't depend on the wall clock.
 */
export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number {
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) throw new Error(`invalid birthDate: ${birthDate}`);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}
