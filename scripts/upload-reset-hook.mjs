// Upload a PocketBase instance's reset-worker hook to its PocketHost instance
// over SFTP (via scp). PocketHost hooks live on the instance filesystem and
// can't be installed over the API, so this is the one manual artifact — scripted
// here for repeatability.
//
//   node scripts/upload-reset-hook.mjs <rp|aa>
//
// Connection settings come from the env (.env / .env.local) with sane defaults
// for the PocketHost SFTP gateway. POCKETHOST_SFTP_USER (your PocketHost account
// email) is required — keep it in the gitignored .env.local.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { config as loadEnv } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(root, ".env") });
loadEnv({ path: join(root, ".env.local"), override: true });

const target = process.argv[2];
const instanceFolders = {
  rp: process.env.POCKETHOST_RP_INSTANCE || "webauthn-rp",
  aa: process.env.POCKETHOST_AA_INSTANCE || "webauthn-aa",
};
if (!target || !instanceFolders[target]) {
  console.error("usage: node scripts/upload-reset-hook.mjs <rp|aa>");
  process.exit(1);
}

const user = process.env.POCKETHOST_SFTP_USER;
if (!user) {
  console.error(
    "[upload-reset-hook] set POCKETHOST_SFTP_USER (your PocketHost account email) in .env.local",
  );
  process.exit(1);
}
const host = process.env.POCKETHOST_SFTP_HOST || "ftp.pockethost.io";
const port = process.env.POCKETHOST_SFTP_PORT || "2222";
const key = process.env.POCKETHOST_SFTP_KEY || join(homedir(), ".ssh", "id_ed25519");

const localFile = join(root, "pocketbase", target, "pb_hooks", "reset-worker.pb.js");
if (!existsSync(localFile)) {
  console.error(`[upload-reset-hook] missing ${localFile}`);
  process.exit(1);
}
const hooksDir = `${instanceFolders[target]}/pb_hooks`;
const remote = `${host}:${hooksDir}/reset-worker.pb.js`;

// PocketHost exposes an SFTP-only gateway (scp's exec channel is rejected), so
// drive it with `sftp -b`. The leading `-` on mkdir tolerates an existing dir.
const batch = `-mkdir ${hooksDir}\nput ${localFile} ${hooksDir}/reset-worker.pb.js\n`;

console.log(`[upload-reset-hook] ${target}: ${localFile} -> ${remote}`);
const res = spawnSync(
  "sftp",
  [
    "-i",
    key,
    "-o",
    `Port=${port}`,
    "-o",
    `User=${user}`,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-b",
    "-",
    host,
  ],
  { input: batch, stdio: ["pipe", "inherit", "inherit"] },
);
if (res.status !== 0) {
  console.error(`[upload-reset-hook] sftp failed for ${target} (exit ${res.status ?? "signal"})`);
  process.exit(res.status ?? 1);
}
console.log(
  `[upload-reset-hook] uploaded ${target} reset hook. Set RESET_ENABLED=true on the instance and restart it.`,
);
