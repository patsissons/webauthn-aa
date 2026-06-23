import { NextResponse } from "next/server";
import { listRegionSummaries } from "@/lib/regions";

export const runtime = "nodejs";

// GET /api/regions — feed the demo dropdown (id, label, required constraint,
// and a human-readable summary like "age ≥ 18").
export async function GET() {
  return NextResponse.json({ regions: listRegionSummaries() });
}
