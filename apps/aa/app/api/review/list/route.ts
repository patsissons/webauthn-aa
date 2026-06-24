import { NextResponse } from "next/server";
import { listRequests, summarizeRequest } from "@/lib/requests";

export const runtime = "nodejs";

// GET /api/review/list?status=pending — reviewer queue snapshot (used by API
// tests; the UI consumes /api/review/events instead).
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const rows = await listRequests(status);
  return NextResponse.json({ requests: rows.map(summarizeRequest) });
}
