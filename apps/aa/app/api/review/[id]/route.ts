import { NextResponse } from "next/server";
import { z } from "zod";
import { decideRequest, getRequest, updateReviewFields } from "@/lib/requests";
import { createAttestation } from "@/lib/attestations";
import { emitChange } from "@/lib/event-bus";
import { aaEnv } from "@/lib/env";

export const runtime = "nodejs";

const postSchema = z.object({
  action: z.enum(["edit", "approve", "reject"]),
  reviewedName: z.string().optional(),
  reviewedBirthDate: z.string().optional(),
  decidedBy: z.string().default("reviewer"),
  // Optional attested-payload TTL override (demo/testing); defaults to AA_DATA_TTL_MS.
  ttlMs: z.number().int().positive().optional(),
});

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRequest(id);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(summarize(rec as never));
}

// POST /api/review/:id — reviewer edits fields, or approves/rejects the request.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const rec = await getRequest(id);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rec.status !== "pending" && parsed.data.action !== "edit") {
    return NextResponse.json({ error: "request already decided" }, { status: 409 });
  }

  // Use || (not ??) so PocketBase's empty-string defaults fall through to the
  // claimed values rather than being treated as a present (empty) override.
  const name = parsed.data.reviewedName || rec.reviewedName || rec.claimedName;
  const birthDate = parsed.data.reviewedBirthDate || rec.reviewedBirthDate || rec.claimedBirthDate;

  if (parsed.data.action === "edit") {
    const updated = await updateReviewFields(id, {
      reviewedName: name,
      reviewedBirthDate: birthDate,
    });
    emitChange("requests");
    return NextResponse.json(summarize(updated as never));
  }

  if (parsed.data.action === "reject") {
    const updated = await decideRequest(id, "rejected", { decidedBy: parsed.data.decidedBy });
    emitChange("requests");
    return NextResponse.json(summarize(updated as never));
  }

  // approve: record the decision and mint the attestation.
  const updated = await decideRequest(id, "approved", {
    reviewedName: name,
    reviewedBirthDate: birthDate,
    decidedBy: parsed.data.decidedBy,
  });
  const issuedAt = new Date();
  const ttlMs = parsed.data.ttlMs ?? aaEnv.dataTtlMs;
  await createAttestation({
    requestId: id,
    rpClientId: rec.rpClientId,
    attestedName: name,
    attestedBirthDate: birthDate,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
  });
  emitChange("requests");
  emitChange("attestations");
  return NextResponse.json(summarize(updated as never));
}
