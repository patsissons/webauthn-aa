import { z } from "zod";
import { ageExprSchema } from "./constraints";

/** Region resolution (doc A.5). Region is jurisdiction, never a user choice. */

export const regionSchema = z.object({
  id: z.string(), // "region-1"
  label: z.string(), // "Region 1"
  constraintSetId: z.string(), // e.g. "age_gte_18"
});
export type Region = z.infer<typeof regionSchema>;

/** One entry in config/regions.json. */
export const regionConfigEntrySchema = z.object({
  label: z.string(),
  module: z.literal("age"),
  config: ageExprSchema,
});
export type RegionConfigEntry = z.infer<typeof regionConfigEntrySchema>;

export const regionsConfigSchema = z.record(z.string(), regionConfigEntrySchema);
export type RegionsConfig = z.infer<typeof regionsConfigSchema>;

export type RegionResolverKind = "static" | "location" | "demo";

export interface RegionResolveContext {
  /** Per-request signals (headers, ip, coords) the resolver may consult. */
  request?: { headers?: Record<string, string | undefined>; ip?: string };
  /** Demo-only override supplied by the UI dropdown. */
  demoOverride?: string;
}

export interface RegionResolver {
  resolve(ctx: RegionResolveContext): Promise<Region>;
}
