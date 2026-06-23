import { describe, expect, it } from "vitest";
import { ageModule, ageFromBirthDate } from "./index";

describe("age module — smoke (full grammar coverage in Phase 4)", () => {
  it("compiles a simple threshold to a stable setId", () => {
    const c = ageModule.compile({ op: ">=", value: 18 });
    expect(c.setId).toBe("age_gte_18");
    expect(c.evaluate({ age: 27 }).pass).toBe(true);
    expect(c.evaluate({ age: 16 }).pass).toBe(false);
  });

  it("computes integer age from a birth date at a fixed reference", () => {
    const now = new Date("2026-06-23T00:00:00Z");
    expect(ageFromBirthDate("1999-01-01", now)).toBe(27);
    expect(ageFromBirthDate("2008-12-31", now)).toBe(17);
  });
});
