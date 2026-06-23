import { z } from "zod";

/**
 * Constraint engine + age-module interfaces (doc A.6).
 *
 * NOTE: "attribute attestation" (our age concept) is distinct from WebAuthn
 * "authenticator attestation". These types only ever describe the former.
 */

export const compareOpSchema = z.enum([">=", ">", "<=", "<", "==", "!="]);
export type CompareOp = z.infer<typeof compareOpSchema>;

export type AgeExpr =
  | { op: CompareOp; value: number }
  | { all: AgeExpr[] }
  | { any: AgeExpr[] };

export const ageExprSchema: z.ZodType<AgeExpr> = z.lazy(() =>
  z.union([
    z.object({ op: compareOpSchema, value: z.number() }),
    z.object({ all: z.array(ageExprSchema) }),
    z.object({ any: z.array(ageExprSchema) }),
  ]),
);

export const attributeTypeSchema = z.enum(["integer", "string"]);
export type AttributeType = z.infer<typeof attributeTypeSchema>;

export interface AttributeRequest {
  name: string;
  type: AttributeType;
  derivedFrom?: string;
}

/** A constraint module config compiled into a stable, evaluable form. */
export interface CompiledConstraint {
  /** Stable id stored in the binding, e.g. "age_gte_18". */
  setId: string;
  attributeRequests: AttributeRequest[];
  evaluate(minimized: Record<string, unknown>): { pass: boolean; reason?: string };
}

export interface ConstraintModule {
  id: string; // "age"
  version: string; // "1.0.0"
  compile(config: unknown): CompiledConstraint;
}
