import { describe, expect, it } from "vitest";
import { ageModule, ageFromBirthDate } from "./index";

const evalAge = (config: unknown, age: number) => ageModule.compile(config).evaluate({ age }).pass;

describe("age module — setId derivation", () => {
  it("derives stable ids for simple thresholds", () => {
    expect(ageModule.compile({ op: ">=", value: 18 }).setId).toBe("age_gte_18");
    expect(ageModule.compile({ op: "==", value: 21 }).setId).toBe("age_eq_21");
    expect(ageModule.compile({ op: "<", value: 13 }).setId).toBe("age_lt_13");
  });

  it("derives structural ids for nested expressions", () => {
    expect(ageModule.compile({ all: [{ op: ">=", value: 18 }, { op: "<", value: 21 }] }).setId).toBe(
      "age_all(age_gte_18,age_lt_21)",
    );
  });

  it("requests the derived integer age (DOB stays at the AA)", () => {
    const c = ageModule.compile({ op: ">=", value: 18 });
    expect(c.attributeRequests).toEqual([{ name: "age", type: "integer", derivedFrom: "birthDate" }]);
  });
});

describe("age module — every comparison operator", () => {
  it(">= / >", () => {
    expect(evalAge({ op: ">=", value: 18 }, 18)).toBe(true);
    expect(evalAge({ op: ">=", value: 18 }, 17)).toBe(false);
    expect(evalAge({ op: ">", value: 18 }, 18)).toBe(false);
    expect(evalAge({ op: ">", value: 18 }, 19)).toBe(true);
  });
  it("<= / <", () => {
    expect(evalAge({ op: "<=", value: 65 }, 65)).toBe(true);
    expect(evalAge({ op: "<=", value: 65 }, 66)).toBe(false);
    expect(evalAge({ op: "<", value: 13 }, 12)).toBe(true);
    expect(evalAge({ op: "<", value: 13 }, 13)).toBe(false);
  });
  it("== / !=", () => {
    expect(evalAge({ op: "==", value: 21 }, 21)).toBe(true);
    expect(evalAge({ op: "==", value: 21 }, 22)).toBe(false);
    expect(evalAge({ op: "!=", value: 21 }, 22)).toBe(true);
    expect(evalAge({ op: "!=", value: 21 }, 21)).toBe(false);
  });
});

describe("age module — all/any combinators", () => {
  it("all is AND", () => {
    const cfg = { all: [{ op: ">=", value: 18 }, { op: "<", value: 21 }] }; // 18 <= age < 21
    expect(evalAge(cfg, 19)).toBe(true);
    expect(evalAge(cfg, 21)).toBe(false);
    expect(evalAge(cfg, 17)).toBe(false);
  });
  it("any is OR", () => {
    const cfg = { any: [{ op: "<", value: 13 }, { op: ">", value: 65 }] }; // age < 13 OR age > 65
    expect(evalAge(cfg, 10)).toBe(true);
    expect(evalAge(cfg, 70)).toBe(true);
    expect(evalAge(cfg, 40)).toBe(false);
  });
  it("nests all within any", () => {
    const cfg = {
      any: [{ all: [{ op: ">=", value: 18 }, { op: "<", value: 21 }] }, { op: ">", value: 65 }],
    };
    expect(evalAge(cfg, 19)).toBe(true);
    expect(evalAge(cfg, 70)).toBe(true);
    expect(evalAge(cfg, 30)).toBe(false);
  });

  it("fails closed on missing/non-numeric age", () => {
    const c = ageModule.compile({ op: ">=", value: 18 });
    expect(c.evaluate({}).pass).toBe(false);
    expect(c.evaluate({ age: "old" }).pass).toBe(false);
  });
});

describe("ageFromBirthDate", () => {
  const now = new Date("2026-06-23T00:00:00Z");
  it("computes integer age at a fixed reference", () => {
    expect(ageFromBirthDate("1999-01-01", now)).toBe(27);
    expect(ageFromBirthDate("2007-01-01", now)).toBe(19);
    expect(ageFromBirthDate("2008-12-31", now)).toBe(17);
  });
  it("handles the day before / of a birthday", () => {
    expect(ageFromBirthDate("2008-06-24", now)).toBe(17); // birthday tomorrow
    expect(ageFromBirthDate("2008-06-23", now)).toBe(18); // birthday today
  });
});
