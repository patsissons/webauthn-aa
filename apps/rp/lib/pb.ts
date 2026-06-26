import "server-only";
import PocketBase from "pocketbase";
import { rpEnv } from "./env";
import { ensureProvisioned } from "./bootstrap";

// Server-side superuser PocketBase client (doc: server-to-server only). Cached
// across requests; re-authenticates when the stored token is no longer valid.
let client: PocketBase | null = null;

export async function getPb(): Promise<PocketBase> {
  if (!client) {
    client = new PocketBase(rpEnv.pocketbaseUrl);
    client.autoCancellation(false);
  }
  if (!client.authStore.isValid) {
    await client
      .collection("_superusers")
      .authWithPassword(rpEnv.pbSuperuserEmail, rpEnv.pbSuperuserPassword);
  }
  // Self-heal an empty instance (import schema) once per process.
  await ensureProvisioned(client);
  return client;
}
