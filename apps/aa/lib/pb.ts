import "server-only";
import PocketBase from "pocketbase";
import { aaEnv } from "./env";
import { ensureProvisioned } from "./bootstrap";

// Server-side superuser PocketBase client for the AA instance. Cached across
// requests; re-authenticates when the stored token is no longer valid.
let client: PocketBase | null = null;

export async function getPb(): Promise<PocketBase> {
  if (!client) {
    client = new PocketBase(aaEnv.pocketbaseUrl);
    client.autoCancellation(false);
  }
  if (!client.authStore.isValid) {
    await client
      .collection("_superusers")
      .authWithPassword(aaEnv.pbSuperuserEmail, aaEnv.pbSuperuserPassword);
  }
  // Self-heal an empty instance (import schema + seed rp_clients) once per process.
  await ensureProvisioned(client);
  return client;
}
