// Remote provisioning for a hosted (PocketHost) AA instance.
//
// Unlike scripts/seed.mjs, this does NOT touch the local pocketbase binary or
// upsert superusers — PocketHost owns the superuser, and collections are created
// by uploading pocketbase/aa/pb_migrations to the instance (auto-applied on
// serve). This script only seeds/updates the AA `rp_clients` row for the RP
// client, idempotently, via the JS SDK using superuser auth.
//
// Reads the repo-root .env / .env.local for convenience, but every value can be
// overridden via the environment (CI / one-off runs). Required inputs:
//   PB_URL                          remote AA instance, e.g. https://webauthn-aa.pockethost.io
//   PB_SUPERUSER_EMAIL / _PASSWORD  PocketHost superuser credentials
//   ATTESTATION_API_AUTH_TOKEN      RP bearer token (stored here as its sha256 hash)
//   RP_WEBHOOK_SECRET               shared HMAC secret (AA signs, RP verifies)
//   RP_WEBHOOK_URL                  where the AA delivers webhooks, e.g.
//                                   https://<rp-host>/api/webhooks/attestation
// Optional:
//   ATTESTATION_REQUESTED_ATTRIBUTES  defaults to "name,age"
//   RP_CLIENT_NAME                    rp_clients row name, defaults to "demo-rp"
//
// Example:
//   PB_URL=https://webauthn-aa.pockethost.io \
//   PB_SUPERUSER_EMAIL=admin@example.com PB_SUPERUSER_PASSWORD=... \
//   ATTESTATION_API_AUTH_TOKEN=<prod token> RP_WEBHOOK_SECRET=<prod secret> \
//   RP_WEBHOOK_URL=https://webauthn-rp-xxxx.vercel.app/api/webhooks/attestation \
//   node scripts/provision-remote.mjs
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";
import PocketBase from "pocketbase";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Explicit environment variables take precedence (this is a remote/CI tool), so
// load the dotenv files WITHOUT override — they only fill gaps. Otherwise a
// committed .env.local would clobber a prod token/secret passed on the command
// line and seed the wrong bearerTokenHash.
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const sha256hex = (s) => createHash("sha256").update(s).digest("hex");

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`[provision] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  // Default PB_URL to the AA PocketBase URL if the operator set that instead.
  const url = required("PB_URL", process.env.POCKETBASE_AA_URL);
  const email = required("PB_SUPERUSER_EMAIL", process.env.POCKETBASE_AA_SUPERUSER_EMAIL);
  const password = required("PB_SUPERUSER_PASSWORD", process.env.POCKETBASE_AA_SUPERUSER_PASSWORD);
  const token = required("ATTESTATION_API_AUTH_TOKEN");
  const webhookSecret = required("RP_WEBHOOK_SECRET");
  const webhookUrl = required("RP_WEBHOOK_URL");
  const clientName = process.env.RP_CLIENT_NAME || "demo-rp";
  const allowedAttributes = (process.env.ATTESTATION_REQUESTED_ATTRIBUTES || "name,age")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    console.warn(`[provision] warning: RP_WEBHOOK_URL points at localhost (${webhookUrl})`);
  }

  console.log(`[provision] target ${url} — seeding rp_clients/${clientName}`);
  const pb = new PocketBase(url);
  pb.autoCancellation(false);

  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch (err) {
    console.error(
      `[provision] superuser auth failed for ${url}: ${err?.message ?? err}\n` +
        `[provision] check PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD on the PocketHost instance.`,
    );
    process.exit(1);
  }

  // Preflight: the rp_clients collection must exist (migrations applied).
  try {
    await pb.collections.getOne("rp_clients");
  } catch {
    console.error(
      `[provision] collection 'rp_clients' not found on ${url}.\n` +
        `[provision] apply pocketbase/aa/pb_migrations to the instance first ` +
        `(upload to pb_migrations and restart, or import the schema via the Admin UI).`,
    );
    process.exit(1);
  }

  const data = {
    name: clientName,
    bearerTokenHash: sha256hex(token),
    allowedAttributes,
    webhookUrl,
    webhookSecret,
  };

  const existing = await pb
    .collection("rp_clients")
    .getFirstListItem(`name="${clientName}"`)
    .catch(() => null);
  if (existing) {
    await pb.collection("rp_clients").update(existing.id, data);
    console.log(`[provision] updated rp_clients/${clientName} (${existing.id})`);
  } else {
    const rec = await pb.collection("rp_clients").create(data);
    console.log(`[provision] created rp_clients/${clientName} (${rec.id})`);
  }
  console.log("[provision] done");
}

main().catch((err) => {
  console.error("[provision] failed:", err?.message ?? err);
  process.exit(1);
});
