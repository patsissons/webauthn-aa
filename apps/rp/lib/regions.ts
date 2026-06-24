import "server-only";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { regionsConfigSchema, type Region } from "@webauthn-aa/contracts";
import { getConstraintModule, describeAge } from "@webauthn-aa/constraints";
import { rpEnv } from "./env";
import { pickRegion } from "./region-resolver";

interface CompiledRegion {
  id: string;
  label: string;
  constraintSetId: string;
  /** Human-readable constraint, e.g. "age ≥ 18". */
  summary: string;
  /** Whether a cached "satisfied" stays valid as the device ages (see CompiledConstraint). */
  monotonic: boolean;
  evaluate: (minimized: Record<string, unknown>) => { pass: boolean; reason?: string };
}

export interface RegionSummary {
  id: string;
  label: string;
  constraintSetId: string;
  summary: string;
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
      summary: describeAge(entry.config),
      monotonic: compiled.monotonic,
      evaluate: compiled.evaluate,
    };
  });
  return cache;
}

/**
 * Whether a constraint can only become more satisfied over time. Re-auth may
 * trust a cached pass for monotonic constraints; non-monotonic ones must be
 * re-checked against the current age. Unknown ids default to false (safe: refresh).
 */
export function isConstraintMonotonic(constraintSetId: string): boolean {
  return loadRegions().find((r) => r.constraintSetId === constraintSetId)?.monotonic ?? false;
}

export function listRegions(): Region[] {
  return loadRegions().map((r) => ({
    id: r.id,
    label: r.label,
    constraintSetId: r.constraintSetId,
  }));
}

/** Region listing with a human-readable constraint summary, for the demo UI. */
export function listRegionSummaries(): RegionSummary[] {
  return loadRegions().map((r) => ({
    id: r.id,
    label: r.label,
    constraintSetId: r.constraintSetId,
    summary: r.summary,
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

/** Resolve the region via the configured strategy (static | location | demo). */
export function resolveRegion(ctx: { demoOverride?: string; regionHint?: string } = {}): Region {
  return pickRegion({
    kind: rpEnv.regionResolver,
    rpRegion: rpEnv.rpRegion,
    regions: listRegions(),
    demoOverride: ctx.demoOverride,
    regionHint: ctx.regionHint,
  });
}
