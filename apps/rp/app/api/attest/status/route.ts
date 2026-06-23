import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAttestStatus } from "@/lib/attest-status";

export const runtime = "nodejs";

const bodySchema = z.object({
  requestId: z.string(),
  demoRegion: z.string().optional(),
});

// POST /api/attest/status — single-shot status check (kept for fail-closed
// verification; the browser uses the /api/attest/events SSE stream instead).
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  try {
    const result = await resolveAttestStatus(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ status: "error" }, { status: 502 }); // fail-closed
  }
}
