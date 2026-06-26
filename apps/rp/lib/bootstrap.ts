import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type PocketBase from "pocketbase";
import type { CollectionModel } from "pocketbase";

// App-side provisioning: when the hosted PocketBase instance is empty, import
// the committed schema snapshot so a fresh PocketHost instance + a superuser is
// all that's needed; the RP app initializes its collections on first use. The RP
// has no seed rows (unlike the AA's rp_clients).

const SENTINEL = "credentials";

// Snapshot lives at the repo root (pocketbase/rp/schema.json); next.config.ts
// traces it into the serverless bundle via outputFileTracingIncludes.
function loadSchema(): CollectionModel[] {
  const path = join(process.cwd(), "..", "..", "pocketbase", "rp", "schema.json");
  return JSON.parse(readFileSync(path, "utf8")) as CollectionModel[];
}

async function collectionExists(pb: PocketBase, name: string): Promise<boolean> {
  try {
    await pb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

let pending: Promise<void> | null = null;

/** Idempotently provision the RP instance's schema, at most once per process. */
export function ensureProvisioned(pb: PocketBase): Promise<void> {
  if (!pending) {
    pending = (async () => {
      if (await collectionExists(pb, SENTINEL)) return;
      try {
        await pb.collections.import(loadSchema(), false);
        console.log("[bootstrap] imported RP schema into empty instance");
      } catch (err) {
        // A concurrent cold-start may have imported first; tolerate and verify.
        if (!(await collectionExists(pb, SENTINEL))) throw err;
      }
    })().catch((err) => {
      pending = null; // allow a later request to retry a failed bootstrap
      throw err;
    });
  }
  return pending;
}
