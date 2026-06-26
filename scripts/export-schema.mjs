// Export each local PocketBase instance's non-system collection schema to a
// committed JSON snapshot (pocketbase/{rp,aa}/schema.json). The Vercel apps
// import these at runtime to bootstrap an empty hosted instance via
// pb.collections.import (see apps/{rp,aa}/lib/bootstrap.ts), so the schema stays
// a single source of truth derived from the same local DBs the migrations build.
//
// Run after changing pocketbase/*/pb_migrations to keep the snapshots in sync:
//   node scripts/get-pocketbase.mjs && node scripts/seed.mjs   # ensure local DBs exist
//   node scripts/export-schema.mjs
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";
import { config as loadEnv } from "dotenv";
import PocketBase from "pocketbase";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(root, ".env") });
loadEnv({ path: join(root, ".env.local"), override: true });

const resolveDir = (envVal, fallback) => {
  const v = envVal || fallback;
  return isAbsolute(v) ? v : join(root, v);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pbBin = join(root, "bin", "pocketbase");
if (!existsSync(pbBin)) {
  console.error(
    "[export-schema] bin/pocketbase missing — run `node scripts/get-pocketbase.mjs` first",
  );
  process.exit(1);
}

const instances = {
  rp: {
    dir: resolveDir(process.env.POCKETBASE_RP_DATA_DIR, "pocketbase/rp/pb_data"),
    migrations: join(root, "pocketbase/rp/pb_migrations"),
    out: join(root, "pocketbase/rp/schema.json"),
    httpAddr: "127.0.0.1:8090",
    url: "http://127.0.0.1:8090",
    email: process.env.POCKETBASE_RP_SUPERUSER_EMAIL,
    password: process.env.POCKETBASE_RP_SUPERUSER_PASSWORD,
  },
  aa: {
    dir: resolveDir(process.env.POCKETBASE_AA_DATA_DIR, "pocketbase/aa/pb_data"),
    migrations: join(root, "pocketbase/aa/pb_migrations"),
    out: join(root, "pocketbase/aa/schema.json"),
    httpAddr: "127.0.0.1:8091",
    url: "http://127.0.0.1:8091",
    email: process.env.POCKETBASE_AA_SUPERUSER_EMAIL,
    password: process.env.POCKETBASE_AA_SUPERUSER_PASSWORD,
  },
};

async function waitForHealth(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`server at ${url} did not become healthy`);
}

function startServer(inst) {
  return spawn(
    pbBin,
    ["serve", "--dir", inst.dir, "--migrationsDir", inst.migrations, "--http", inst.httpAddr],
    { stdio: "ignore" },
  );
}

// PocketBase ships a default `users` auth collection that this app never uses
// (the migrations don't define it). Exclude it + system collections so the
// snapshot is exactly the app-owned schema and bootstrap never touches a hosted
// instance's defaults.
const DEFAULT_COLLECTIONS = new Set(["users"]);

// Drop volatile/computed fields so the snapshot is a stable schema artifact.
function clean(collections) {
  return collections
    .filter((c) => !c.system && !DEFAULT_COLLECTIONS.has(c.name))
    .map((c) => {
      const rest = { ...c };
      delete rest.created;
      delete rest.updated;
      return rest;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function exportInstance(inst) {
  const proc = startServer(inst);
  try {
    await waitForHealth(inst.url);
    const pb = new PocketBase(inst.url);
    pb.autoCancellation(false);
    await pb.collection("_superusers").authWithPassword(inst.email, inst.password);
    const collections = clean(await pb.collections.getFullList());
    writeFileSync(inst.out, JSON.stringify(collections, null, 2) + "\n");
    console.log(`[export-schema] wrote ${inst.out} (${collections.length} collections)`);
  } finally {
    proc.kill("SIGTERM");
    await sleep(300);
  }
}

async function main() {
  for (const inst of Object.values(instances)) {
    if (!inst.email || !inst.password) {
      throw new Error("POCKETBASE_{RP,AA}_SUPERUSER_* must be set (see .env.local)");
    }
    await exportInstance(inst);
  }
  console.log("[export-schema] done");
}

main().catch((err) => {
  console.error("[export-schema] failed:", err.message);
  process.exit(1);
});
