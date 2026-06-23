import { describe, expect, it } from "vitest";
import { pickRegion } from "./region-resolver";

const regions = [
  { id: "region-1", label: "Region 1", constraintSetId: "age_gte_18" },
  { id: "region-2", label: "Region 2", constraintSetId: "age_gte_21" },
];

describe("region resolver strategies", () => {
  it("static ignores overrides and binds to RP_REGION", () => {
    const r = pickRegion({ kind: "static", rpRegion: "region-2", regions, demoOverride: "region-1" });
    expect(r.id).toBe("region-2");
  });

  it("demo honors the dropdown override, else falls back to RP_REGION", () => {
    expect(pickRegion({ kind: "demo", rpRegion: "region-1", regions, demoOverride: "region-2" }).id).toBe(
      "region-2",
    );
    expect(pickRegion({ kind: "demo", rpRegion: "region-1", regions }).id).toBe("region-1");
  });

  it("location uses the region hint, else falls back", () => {
    expect(pickRegion({ kind: "location", rpRegion: "region-1", regions, regionHint: "region-2" }).id).toBe(
      "region-2",
    );
    expect(pickRegion({ kind: "location", rpRegion: "region-2", regions }).id).toBe("region-2");
  });

  it("falls back to the first region when RP_REGION is unknown", () => {
    expect(pickRegion({ kind: "static", rpRegion: "nope", regions }).id).toBe("region-1");
  });
});
