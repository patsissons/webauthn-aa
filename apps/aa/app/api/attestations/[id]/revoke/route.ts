import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeAttestation } from "@/lib/attestations";
import { enqueueRevocationWebhook, deliverJob } from "@/lib/webhook";

export const runtime = "nodejs";

const bodySchema = z.object({ reason: z.string().default("reviewer revoked") });

// POST /api/attestations/:id/revoke — revoke and enqueue a signed webhook to the
// RP. The PB cron worker delivers with retries; we also attempt immediate
// delivery so the demo is responsive.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const reason = parsed.success ? parsed.data.reason : "reviewer revoked";

  const attestation = await revokeAttestation(id, reason);
  if (!attestation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const job = await enqueueRevocationWebhook(attestation);
  // Best-effort immediate delivery; the cron worker is the retry backstop.
  await deliverJob(job.id).catch(() => {});

  return NextResponse.json({ ok: true, attestationId: id, jobId: job.id });
}
