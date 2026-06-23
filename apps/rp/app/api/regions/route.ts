import { NextResponse } from "next/server";
import { listRegions } from "@/lib/regions";

export const runtime = "nodejs";

// GET /api/regions — feed the demo dropdown (id, label, required constraint).
export async function GET() {
  return NextResponse.json({ regions: listRegions() });
}
