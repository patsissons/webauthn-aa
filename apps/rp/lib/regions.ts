import "server-only";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { regionsConfigSchema, type Region } from "@webauthn-aa/contracts";
import { getConstraintModule } from "@webauthn-aa/constraints";
import { rpEnv } from "./env";

interface CompiledRegion {
  id: string;
  label: string;
  constraintSetId: string;
  evaluate: (minimized: Record<string, unknown>) => { pass: boolean; reason?: string };
}

let cache: CompiledRegion[] | null = null;

function configPath(): string {
  const p = rpEnv.regionsConfigPath;
  if (isAbsolute(p)) return p;
  const repoRoot = join(process.cwd(), "..", "..");
  return join(repoRoot, p.replace(/^\.\//, ""));
}

export function loadRegions(): CompiledRegion[] {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(configPath(), "utf8"));
  const cfg = regionsConfigSchema.parse(raw);
  cache = Object.entries(cfg).map(([id, entry]) => {
    const compiled = getConstraintModule(entry.module).compile(entry.config);
    return {
      id,
      label: entry.label,
      constraintSetId: compiled.setId,
      evaluate: compiled.evaluate,
    };
  });
  return cache;
}

export function listRegions(): Region[] {
  return loadRegions().map((r) => ({
    id: r.id,
    label: r.label,
    constraintSetId: r.constraintSetId,
  }));
}

export function getRegion(id: string): Region | null {
  const r = loadRegions().find((x) => x.id === id);
  return r ? { id: r.id, label: r.label, constraintSetId: r.constraintSetId } : null;
}

/**
 * Evaluate EVERY configured region's constraint against the attested data and
 * return the set of constraintSetIds that pass (the device's
 * satisfiedConstraints, doc A.7). Constraint evaluation happens only here, at
 * attestation time — never at re-auth.
 */
export function evaluateAllRegions(minimized: { age?: number; name?: string }): string[] {
  const passed = new Set<string>();
  for (const r of loadRegions()) {
    if (r.evaluate(minimized as Record<string, unknown>).pass) passed.add(r.constraintSetId);
  }
  return [...passed];
}

/** Phase 3 baseline resolver; Phase 4 formalizes static/location/demo strategies. */
export function resolveRegion(opts: { demoOverride?: string } = {}): Region {
  const fallback = getRegion(rpEnv.rpRegion) ?? listRegions()[0];
  if (rpEnv.regionResolver === "demo" && opts.demoOverride) {
    return getRegion(opts.demoOverride) ?? fallback;
  }
  return fallback;
}
