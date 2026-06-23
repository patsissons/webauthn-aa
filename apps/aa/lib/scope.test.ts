import { describe, expect, it } from "vitest";
import { checkScope, scopeAttributes } from "./scope";

describe("attribute scope enforcement", () => {
  const allowed = ["name", "age"];

  it("accepts a subset of allowed attributes", () => {
    expect(checkScope(["name", "age"], allowed).ok).toBe(true);
    expect(checkScope(["age"], allowed).ok).toBe(true);
  });

  it("rejects attributes outside the token scope and reports them", () => {
    const res = checkScope(["name", "ssn"], allowed);
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["ssn"]);
  });

  it("returns only scoped attributes and never date of birth", () => {
    const out = scopeAttributes(["name", "age"], allowed, {
      name: "Ada",
      age: 27,
    });
    expect(out).toEqual({ name: "Ada", age: 27 });
    expect(out).not.toHaveProperty("birthDate");
  });

  it("drops attributes that are requested but not allowed", () => {
    const out = scopeAttributes(["name", "age"], ["age"], { name: "Ada", age: 27 });
    expect(out).toEqual({ age: 27 });
  });
});
