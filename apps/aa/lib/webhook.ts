import "server-only";
import { createHmac } from "node:crypto";
import type { RecordModel } from "pocketbase";
import { WEBHOOK_EVENT_HEADER, WEBHOOK_SIGNATURE_HEADER } from "@webauthn-aa/contracts";
import { getPb } from "./pb";
import { aaEnv } from "./env";

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Enqueue a revocation webhook job (delivered by the PB cron worker + a best-
 * effort immediate attempt). */
export async function enqueueRevocationWebhook(attestation: RecordModel): Promise<RecordModel> {
  const pb = await getPb();
  return pb.collection("webhook_jobs").create({
    attestationId: attestation.id,
    rpClientId: attestation.rpClientId,
    event: "revoked",
    payload: {
      event: "revoked",
      attestationId: attestation.id,
      occurredAt: new Date().toISOString(),
    },
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    status: "pending",
  });
}

/**
 * Best-effort immediate "decision" webhook so the RP can resolve its waiting
 * status stream without polling. No retry/persistence — the RP's stream also
 * checks status on connect, covering a missed delivery.
 */
export async function deliverDecisionWebhook(rpClientId: string, requestId: string): Promise<void> {
  const pb = await getPb();
  const client = await pb
    .collection("rp_clients")
    .getOne(rpClientId)
    .catch(() => null);
  if (!client || !client.webhookUrl) return;
  const body = JSON.stringify({
    event: "decision",
    requestId,
    occurredAt: new Date().toISOString(),
  });
  const signature = signBody(body, client.webhookSecret);
  try {
    await fetch(client.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        [WEBHOOK_EVENT_HEADER]: "decision",
      },
      body,
    });
  } catch {
    /* best-effort */
  }
}

/** Deliver one job; on failure apply exponential backoff (mirrors the cron). */
export async function deliverJob(jobId: string): Promise<boolean> {
  const pb = await getPb();
  const job = await pb
    .collection("webhook_jobs")
    .getOne(jobId)
    .catch(() => null);
  if (!job || job.status === "delivered") return false;
  const client = await pb
    .collection("rp_clients")
    .getOne(job.rpClientId)
    .catch(() => null);
  if (!client || !client.webhookUrl) return false;

  const body = JSON.stringify(job.payload);
  const signature = signBody(body, client.webhookSecret);
  try {
    const res = await fetch(client.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        [WEBHOOK_EVENT_HEADER]: job.event,
      },
      body,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    await pb.collection("webhook_jobs").update(jobId, { status: "delivered" });
    return true;
  } catch (err) {
    const attempts = (job.attempts ?? 0) + 1;
    const failed = attempts >= aaEnv.webhookMaxAttempts;
    const delay = aaEnv.webhookBaseDelayMs * Math.pow(2, attempts);
    await pb.collection("webhook_jobs").update(jobId, {
      attempts,
      status: failed ? "failed" : "pending",
      nextAttemptAt: new Date(Date.now() + delay).toISOString(),
      lastError: String((err as Error).message ?? err),
    });
    return false;
  }
}
