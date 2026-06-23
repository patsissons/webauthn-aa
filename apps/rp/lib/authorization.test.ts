import { describe, expect, it } from "vitest";
import { authorizeReauth } from "./authorization";

describe("membership-check authorization (re-auth)", () => {
  const satisfied = ["age_gte_18"]; // an age-19 device attested under Region 1

  it("authorizes when the required constraint is in satisfiedConstraints", () => {
    expect(
      authorizeReauth({ satisfiedConstraints: satisfied, requiredConstraintSetId: "age_gte_18" })
        .authorized,
    ).toBe(true);
  });

  it("denies when the required constraint is not satisfied (no recomputation)", () => {
    const r = authorizeReauth({
      satisfiedConstraints: satisfied,
      requiredConstraintSetId: "age_gte_21",
    });
    expect(r.authorized).toBe(false);
    expect(r.reason).toMatch(/constraint/);
  });

  it("denies a revoked attestation", () => {
    const r = authorizeReauth({
      satisfiedConstraints: ["age_gte_18"],
      requiredConstraintSetId: "age_gte_18",
      attestationStatus: "revoked",
    });
    expect(r.authorized).toBe(false);
    expect(r.reason).toBe("revoked");
  });

  it("denies an expired attestation on freshness", () => {
    const r = authorizeReauth({
      satisfiedConstraints: ["age_gte_18"],
      requiredConstraintSetId: "age_gte_18",
      attestationExpiresAt: "2020-01-01T00:00:00Z",
      now: new Date("2026-06-23T00:00:00Z"),
    });
    expect(r.authorized).toBe(false);
    expect(r.reason).toBe("expired");
  });
});
