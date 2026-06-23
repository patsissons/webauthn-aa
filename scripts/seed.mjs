// Idempotent local provisioning:
//  1. Apply migrations + upsert a PocketBase superuser for each instance (offline).
//  2. Briefly start each server and seed the AA rp_clients row via the JS SDK.
// Reads .env then .env.local (the latter overrides) for the shared secrets.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";
import PocketBase from "pocketbase";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(root, ".env") });
loadEnv({ path: join(root, ".env.local"), override: true });

const pbBin = join(root, "bin", "pocketbase");
if (!existsSync(pbBin)) {
  console.error("[seed] bin/pocketbase missing — run `node scripts/get-pocketbase.mjs` first");
  process.exit(1);
}

const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const instances = {
  rp: {
    dir: join(root, "pocketbase/rp/pb_data"),
    migrations: join(root, "pocketbase/rp/pb_migrations"),
    hooks: join(root, "pocketbase/rp/pb_hooks"),
    url: process.env.POCKETBASE_RP_URL || "http://127.0.0.1:8090",
    httpAddr: "127.0.0.1:8090",
    email: process.env.POCKETBASE_RP_SUPERUSER_EMAIL,
    password: process.env.POCKETBASE_RP_SUPERUSER_PASSWORD,
  },
  aa: {
    dir: join(root, "pocketbase/aa/pb_data"),
    migrations: join(root, "pocketbase/aa/pb_migrations"),
    hooks: join(root, "pocketbase/aa/pb_hooks"),
    url: process.env.POCKETBASE_AA_URL || "http://127.0.0.1:8091",
    httpAddr: "127.0.0.1:8091",
    email: process.env.POCKETBASE_AA_SUPERUSER_EMAIL,
    password: process.env.POCKETBASE_AA_SUPERUSER_PASSWORD,
  },
};

function upsertSuperuser(inst) {
  const res = spawnSync(
    pbBin,
    [
      "superuser",
      "upsert",
      inst.email,
      inst.password,
      "--dir",
      inst.dir,
      "--migrationsDir",
      inst.migrations,
    ],
    { stdio: "inherit" },
  );
  if (res.status !== 0) throw new Error(`superuser upsert failed for ${inst.url}`);
}

async function waitForHealth(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`server at ${url} did not become healthy`);
}

function startServer(inst) {
  return spawn(
    pbBin,
    [
      "serve",
      "--dir",
      inst.dir,
      "--migrationsDir",
      inst.migrations,
      "--hooksDir",
      inst.hooks,
      "--http",
      inst.httpAddr,
    ],
    { stdio: "ignore" },
  );
}

async function main() {
  // Step 1: offline superuser + migrations for both instances.
  for (const inst of Object.values(instances)) {
    console.log(`[seed] provisioning superuser + migrations: ${inst.url}`);
    upsertSuperuser(inst);
  }

  // Step 2: start AA, seed the rp_clients row, stop AA.
  const token = process.env.ATTESTATION_API_AUTH_TOKEN;
  const webhookSecret = process.env.RP_WEBHOOK_SECRET;
  const webhookUrl = process.env.RP_WEBHOOK_URL || "http://localhost:3000/api/webhooks/attestation";
  const allowedAttributes = (process.env.ATTESTATION_REQUESTED_ATTRIBUTES || "name,age")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token || !webhookSecret) {
    throw new Error("ATTESTATION_API_AUTH_TOKEN and RP_WEBHOOK_SECRET must be set in .env.local");
  }

  const aa = instances.aa;
  const proc = startServer(aa);
  try {
    await waitForHealth(aa.url);
    const pb = new PocketBase(aa.url);
    pb.autoCancellation(false);
    await pb.collection("_superusers").authWithPassword(aa.email, aa.password);
    const data = {
      name: "demo-rp",
      bearerTokenHash: sha256hex(token),
      allowedAttributes,
      webhookUrl,
      webhookSecret,
    };
    const existing = await pb
      .collection("rp_clients")
      .getFirstListItem('name="demo-rp"')
      .catch(() => null);
    if (existing) {
      await pb.collection("rp_clients").update(existing.id, data);
      console.log(`[seed] updated rp_clients/demo-rp (${existing.id})`);
    } else {
      const rec = await pb.collection("rp_clients").create(data);
      console.log(`[seed] created rp_clients/demo-rp (${rec.id})`);
    }
  } finally {
    proc.kill("SIGTERM");
    await sleep(300);
  }
  console.log("[seed] done");
}

main().catch((err) => {
  console.error("[seed] failed:", err.message);
  process.exit(1);
});
