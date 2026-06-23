import { NextResponse } from "next/server";
import { rpEnv } from "@/lib/env";

export const runtime = "nodejs";

// GET /api/attest/config — client-poll budget, sourced from RP env (doc C.3).
export async function GET() {
  return NextResponse.json({
    totalBudgetMs: rpEnv.attestationTotalBudgetMs,
    pollIntervalMs: 2000,
    failMode: rpEnv.attestationFailMode,
  });
}
