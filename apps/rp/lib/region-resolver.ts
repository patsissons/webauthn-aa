import type { Region, RegionResolverKind } from "@webauthn-aa/contracts";

/**
 * Pure region resolution (doc A.5). Region is a property of jurisdiction, never
 * a user choice. Kept free of env/server imports so it is unit-testable.
 *
 * - static:   bound to one jurisdiction (RP_REGION). Nothing to spoof.
 * - location: derived from a location signal (here a `regionHint` stand-in for
 *             reverse-geocoded coords / IP geo); spoofable, accepted.
 * - demo:     reads the demo UI dropdown override; demo only.
 */
export function pickRegion(args: {
  kind: RegionResolverKind;
  rpRegion: string;
  regions: Region[];
  demoOverride?: string;
  regionHint?: string;
}): Region {
  const byId = (id?: string) => args.regions.find((r) => r.id === id);
  const fallback = byId(args.rpRegion) ?? args.regions[0];
  if (!fallback) throw new Error("no regions configured");

  switch (args.kind) {
    case "static":
      return fallback;
    case "demo":
      return byId(args.demoOverride) ?? fallback;
    case "location":
      return byId(args.regionHint) ?? fallback;
  }
}
