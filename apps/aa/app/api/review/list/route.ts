import { NextResponse } from "next/server";
import { listRequests } from "@/lib/requests";

export const runtime = "nodejs";

function summarize(r: Record<string, unknown>) {
  return {
    id: r.id,
    status: r.status,
    claimedName: r.claimedName,
    claimedBirthDate: r.claimedBirthDate,
    reviewedName: r.reviewedName,
    reviewedBirthDate: r.reviewedBirthDate,
    created: r.created,
    decidedAt: r.decidedAt,
    hasEvidence: Boolean(r.evidenceImage),
  };
}

// GET /api/review/list?status=pending — reviewer queue (internal, local demo).
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const rows = await listRequests(status);
  return NextResponse.json({ requests: rows.map((r) => summarize(r as never)) });
}
