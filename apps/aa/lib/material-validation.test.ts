import { describe, expect, it } from "vitest";
import { validateMaterial } from "./material-validation";

describe("single-use material validation", () => {
  const now = new Date("2026-06-23T00:00:00Z");
  const future = "2026-06-23T00:05:00Z";
  const past = "2026-06-22T23:55:00Z";

  it("accepts fresh, unused, nonce-matching material", () => {
    expect(
      validateMaterial({ material: { nonce: "n1", expiresAt: future }, nonce: "n1", now }).ok,
    ).toBe(true);
  });

  it("rejects unknown material", () => {
    const r = validateMaterial({ material: null, nonce: "n1", now });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown/);
  });

  it("rejects already-used material (replay)", () => {
    const r = validateMaterial({
      material: { nonce: "n1", expiresAt: future, usedAt: "2026-06-23T00:01:00Z" },
      nonce: "n1",
      now,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/used/);
  });

  it("rejects expired material", () => {
    const r = validateMaterial({ material: { nonce: "n1", expiresAt: past }, nonce: "n1", now });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });

  it("rejects a nonce mismatch", () => {
    const r = validateMaterial({ material: { nonce: "n1", expiresAt: future }, nonce: "n2", now });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/nonce/);
  });
});
