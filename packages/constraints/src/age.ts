import {
  ageExprSchema,
  type AgeExpr,
  type CompareOp,
  type CompiledConstraint,
  type ConstraintModule,
} from "@webauthn-aa/contracts";

function compare(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case ">=":
      return a >= b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case "<":
      return a < b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
  }
}

function evalExpr(expr: AgeExpr, age: number): boolean {
  if ("op" in expr) return compare(expr.op, age, expr.value);
  if ("all" in expr) return expr.all.every((e) => evalExpr(e, age));
  return expr.any.some((e) => evalExpr(e, age));
}

/**
 * Build a stable, human-readable setId from an age expression. The common case
 * (`{op,value}`) yields ids like "age_gte_18"; nested expressions get a
 * deterministic structural id so the same policy always maps to the same id.
 */
const OP_SLUG: Record<CompareOp, string> = {
  ">=": "gte",
  ">": "gt",
  "<=": "lte",
  "<": "lt",
  "==": "eq",
  "!=": "ne",
};

function setIdFor(expr: AgeExpr): string {
  if ("op" in expr) return `age_${OP_SLUG[expr.op]}_${expr.value}`;
  if ("all" in expr) return `age_all(${expr.all.map(setIdFor).join(",")})`;
  return `age_any(${expr.any.map(setIdFor).join(",")})`;
}

const OP_TEXT: Record<CompareOp, string> = {
  ">=": "≥",
  ">": ">",
  "<=": "≤",
  "<": "<",
  "==": "=",
  "!=": "≠",
};

function describeExpr(expr: AgeExpr, top = true): string {
  if ("op" in expr) return `age ${OP_TEXT[expr.op]} ${expr.value}`;
  const parts = "all" in expr ? expr.all : expr.any;
  const joiner = "all" in expr ? " and " : " or ";
  const text = parts.map((e) => describeExpr(e, false)).join(joiner);
  return top ? text : `(${text})`;
}

/** Human-readable summary of an age expression, e.g. "age ≥ 18". */
export function describeAge(config: unknown): string {
  return describeExpr(ageExprSchema.parse(config));
}

/**
 * Monotonic non-decreasing in age: every leaf is `>=`/`>` (and AND/OR preserve
 * monotonicity). For such constraints a cached "satisfied" stays valid as the
 * device ages; others can age out and must be re-checked.
 */
function isMonotonic(expr: AgeExpr): boolean {
  if ("op" in expr) return expr.op === ">=" || expr.op === ">";
  const children = "all" in expr ? expr.all : expr.any;
  return children.every(isMonotonic);
}

export const ageModule: ConstraintModule = {
  id: "age",
  version: "1.0.0",
  compile(config: unknown): CompiledConstraint {
    const expr = ageExprSchema.parse(config);
    return {
      setId: setIdFor(expr),
      attributeRequests: [{ name: "age", type: "integer", derivedFrom: "birthDate" }],
      monotonic: isMonotonic(expr),
      evaluate(minimized: Record<string, unknown>) {
        const age = minimized.age;
        if (typeof age !== "number" || !Number.isFinite(age)) {
          return { pass: false, reason: "missing or non-numeric age" };
        }
        const pass = evalExpr(expr, age);
        return pass ? { pass } : { pass, reason: `age ${age} fails ${setIdFor(expr)}` };
      },
    };
  },
};
