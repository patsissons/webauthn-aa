import "server-only";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type PocketBase from "pocketbase";
import type { CollectionModel } from "pocketbase";
import { aaEnv } from "./env";

// App-side provisioning: when the hosted PocketBase instance is empty (no app
// collections), import the committed schema snapshot and seed the rp_clients
// row — so a fresh PocketHost instance + a superuser is all that's needed; the
// AA app initializes the rest on first use. The reset cron hook
// (pocketbase/aa/pb_hooks/reset-worker.pb.js) wipes only demo data and preserves
// rp_clients, so this seed never needs to re-run after a reset.

const SENTINEL = "rp_clients";

// The snapshot lives at the repo root (pocketbase/aa/schema.json); read it from
// the serverless bundle (next.config.ts traces it in via outputFileTracingIncludes).
function loadSchema(): CollectionModel[] {
  const path = join(process.cwd(), "..", "..", "pocketbase", "aa", "schema.json");
  return JSON.parse(readFileSync(path, "utf8")) as CollectionModel[];
}

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

async function collectionExists(pb: PocketBase, name: string): Promise<boolean> {
  try {
    await pb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

async function ensureSchema(pb: PocketBase): Promise<void> {
  if (await collectionExists(pb, SENTINEL)) return;
  try {
    // deleteMissing=false: only create our app collections, never touch hosted defaults.
    await pb.collections.import(loadSchema(), false);
    console.log("[bootstrap] imported AA schema into empty instance");
  } catch (err) {
    // A concurrent cold-start may have imported first; tolerate that and verify.
    if (!(await collectionExists(pb, SENTINEL))) throw err;
  }
}

async function ensureRpClient(pb: PocketBase): Promise<void> {
  const { rpClientToken, rpClientWebhookSecret, rpClientWebhookUrl } = aaEnv;
  if (!rpClientToken || !rpClientWebhookSecret || !rpClientWebhookUrl) {
    console.warn(
      "[bootstrap] rp_clients not seeded: set ATTESTATION_API_AUTH_TOKEN, RP_WEBHOOK_SECRET, RP_WEBHOOK_URL",
    );
    return;
  }
  const existing = await pb
    .collection(SENTINEL)
    .getFirstListItem(`name="${aaEnv.rpClientName}"`)
    .catch(() => null);
  if (existing) return;
  await pb.collection(SENTINEL).create({
    name: aaEnv.rpClientName,
    bearerTokenHash: sha256hex(rpClientToken),
    allowedAttributes: aaEnv.rpClientAllowedAttributes,
    webhookUrl: rpClientWebhookUrl,
    webhookSecret: rpClientWebhookSecret,
  });
  console.log(`[bootstrap] seeded rp_clients/${aaEnv.rpClientName}`);
}

let pending: Promise<void> | null = null;

/** Idempotently provision the AA instance, at most once per process. */
export function ensureProvisioned(pb: PocketBase): Promise<void> {
  if (!pending) {
    pending = (async () => {
      await ensureSchema(pb);
      await ensureRpClient(pb);
    })().catch((err) => {
      pending = null; // allow a later request to retry a failed bootstrap
      throw err;
    });
  }
  return pending;
}
