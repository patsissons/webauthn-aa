import { NextResponse } from "next/server";
import { getPb } from "@/lib/pb";
import { deliverJob } from "@/lib/webhook";
import { aaEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Webhook retry drain, run on a schedule by Vercel Cron (see apps/aa/vercel.json).
// Mirrors the PocketBase cron hook (pocketbase/aa/pb_hooks/webhook-worker.pb.js),
// which remains the fallback on plans where Vercel Cron can't run every minute.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
async function drain(request: Request): Promise<NextResponse> {
  if (aaEnv.cronSecret && request.headers.get("authorization") !== `Bearer ${aaEnv.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pb = await getPb();
  const now = new Date().toISOString();
  const due = await pb.collection("webhook_jobs").getFullList({
    filter: pb.filter("status = 'pending' && nextAttemptAt <= {:now}", { now }),
    sort: "created",
    batch: 50,
  });

  let delivered = 0;
  for (const job of due) {
    if (await deliverJob(job.id)) delivered += 1;
  }
  return NextResponse.json({ ok: true, due: due.length, delivered });
}

// GET is what Vercel Cron invokes; POST allowed for manual triggering.
export const GET = drain;
export const POST = drain;
