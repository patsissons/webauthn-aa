import "server-only";

/** Server-side RP configuration, sourced from the repo-root .env / .env.local. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

export const rpEnv = {
  rpId: process.env.RP_ID ?? "localhost",
  rpName: process.env.RP_NAME ?? "Demo RP",
  rpOrigin: process.env.RP_ORIGIN ?? "http://localhost:3000",

  attestationApiBaseUrl: process.env.ATTESTATION_API_BASE_URL ?? "http://localhost:3001",
  get attestationApiAuthToken() {
    return required("ATTESTATION_API_AUTH_TOKEN");
  },
  attestationProtocolVersion: process.env.ATTESTATION_PROTOCOL_VERSION ?? "1",
  attestationRequestedAttributes: (process.env.ATTESTATION_REQUESTED_ATTRIBUTES ?? "name,age")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  attestationAwaitTimeoutMs: Number(process.env.ATTESTATION_AWAIT_TIMEOUT_MS ?? 25000),
  attestationTotalBudgetMs: Number(process.env.ATTESTATION_TOTAL_BUDGET_MS ?? 180000),
  attestationFailMode: (process.env.ATTESTATION_FAIL_MODE ?? "closed") as "closed" | "open",

  regionResolver: (process.env.REGION_RESOLVER ?? "demo") as "static" | "location" | "demo",
  rpRegion: process.env.RP_REGION ?? "region-1",
  regionsConfigPath: process.env.REGIONS_CONFIG_PATH ?? "./config/regions.json",
  get rpWebhookSecret() {
    return required("RP_WEBHOOK_SECRET");
  },

  pocketbaseUrl: process.env.POCKETBASE_RP_URL ?? "http://127.0.0.1:8090",
  get pbSuperuserEmail() {
    return required("POCKETBASE_RP_SUPERUSER_EMAIL");
  },
  get pbSuperuserPassword() {
    return required("POCKETBASE_RP_SUPERUSER_PASSWORD");
  },
};
