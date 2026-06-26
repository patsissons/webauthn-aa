import "server-only";

/** Server-side AA configuration, sourced from the repo-root .env / .env.local. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

export const aaEnv = {
  origin: process.env.AA_ORIGIN ?? "http://localhost:3001",
  encryptionMaterialTtlMs: Number(process.env.AA_ENCRYPTION_MATERIAL_TTL_MS ?? 300000),
  awaitMaxWaitMs: Number(process.env.AA_AWAIT_MAX_WAIT_MS ?? 25000),
  dataTtlMs: Number(process.env.AA_DATA_TTL_MS ?? 31536000000),
  webhookMaxAttempts: Number(process.env.AA_WEBHOOK_MAX_ATTEMPTS ?? 8),
  webhookBaseDelayMs: Number(process.env.AA_WEBHOOK_BASE_DELAY_MS ?? 1000),

  pocketbaseUrl: process.env.POCKETBASE_AA_URL ?? "http://127.0.0.1:8091",
  get pbSuperuserEmail() {
    return required("POCKETBASE_AA_SUPERUSER_EMAIL");
  },
  get pbSuperuserPassword() {
    return required("POCKETBASE_AA_SUPERUSER_PASSWORD");
  },

  // RP-client seed used to bootstrap an empty instance's rp_clients row
  // (apps/aa/lib/bootstrap.ts). Optional: if the token/secret/url aren't set the
  // app still creates the schema but skips seeding (e.g. local dev seeds it via
  // scripts/seed.mjs instead). The bearer token is stored only as its sha256.
  rpClientName: process.env.RP_CLIENT_NAME ?? "demo-rp",
  rpClientToken: process.env.ATTESTATION_API_AUTH_TOKEN,
  rpClientWebhookSecret: process.env.RP_WEBHOOK_SECRET,
  rpClientWebhookUrl: process.env.RP_WEBHOOK_URL,
  rpClientAllowedAttributes: (process.env.ATTESTATION_REQUESTED_ATTRIBUTES ?? "name,age")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Shared secret Vercel Cron presents (Authorization: Bearer) to the webhook
  // drain route. Optional locally; required for the hosted cron to authenticate.
  cronSecret: process.env.CRON_SECRET,
};
