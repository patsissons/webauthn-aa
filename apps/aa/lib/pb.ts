import "server-only";
import PocketBase from "pocketbase";
import { aaEnv } from "./env";

// Server-side superuser PocketBase client for the AA instance. Cached across
// requests; re-authenticates when the stored token is no longer valid.
let client: PocketBase | null = null;

export async function getPb(): Promise<PocketBase> {
  if (!client) {
    client = new PocketBase(aaEnv.pocketbaseUrl);
    client.autoCancellation(false);
  }
  if (!client.authStore.isValid) {
    await client.collection("_superusers").authWithPassword(
      aaEnv.pbSuperuserEmail,
      aaEnv.pbSuperuserPassword,
    );
  }
  return client;
}
