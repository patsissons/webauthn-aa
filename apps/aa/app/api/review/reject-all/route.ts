import { NextResponse } from "next/server";
import { listRequests, decideRequest } from "@/lib/requests";

export const runtime = "nodejs";

// POST /api/review/reject-all — reject every pending request (demo convenience).
export async function POST() {
  const pending = await listRequests("pending");
  let rejected = 0;
  for (const r of pending) {
    await decideRequest(r.id, "rejected", { decidedBy: "reviewer (bulk)" });
    rejected += 1;
  }
  return NextResponse.json({ ok: true, rejected });
}
