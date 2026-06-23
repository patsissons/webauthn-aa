// Downloads the PocketBase binary for the current platform into ./bin.
// Idempotent: skips the download if bin/pocketbase already exists.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "bin");
const binPath = join(binDir, "pocketbase");

if (existsSync(binPath)) {
  console.log("[get-pocketbase] bin/pocketbase already present, skipping");
  process.exit(0);
}

const platform = process.platform; // darwin | linux | win32
const arch = process.arch; // arm64 | x64
const osMap = { darwin: "darwin", linux: "linux", win32: "windows" };
const archMap = { arm64: "arm64", x64: "amd64" };
const os = osMap[platform];
const pbArch = archMap[arch];
if (!os || !pbArch) {
  console.error(`[get-pocketbase] unsupported platform ${platform}/${arch}`);
  process.exit(1);
}

async function resolveVersion() {
  if (process.env.POCKETBASE_VERSION) return process.env.POCKETBASE_VERSION;
  try {
    const res = await fetch("https://api.github.com/repos/pocketbase/pocketbase/releases/latest", {
      headers: { "user-agent": "webauthn-aa-setup" },
    });
    const json = await res.json();
    return String(json.tag_name).replace(/^v/, "");
  } catch {
    return "0.28.4"; // pinned fallback if the API is unreachable
  }
}

const version = await resolveVersion();
const zipName = `pocketbase_${version}_${os}_${pbArch}.zip`;
const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${zipName}`;
const tmpZip = join(tmpdir(), zipName);

console.log(`[get-pocketbase] downloading PocketBase v${version} (${os}/${pbArch})`);
const res = await fetch(url, { headers: { "user-agent": "webauthn-aa-setup" } });
if (!res.ok) {
  console.error(`[get-pocketbase] download failed: ${res.status} ${url}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const { writeFileSync, chmodSync } = await import("node:fs");
writeFileSync(tmpZip, buf);

mkdirSync(binDir, { recursive: true });

// Unzip using a CLI tool available on macOS/Linux.
const unzip = spawnSync("unzip", ["-o", tmpZip, "pocketbase", "-d", binDir], { stdio: "inherit" });
if (unzip.status !== 0) {
  // macOS fallback
  const ditto = spawnSync("ditto", ["-x", "-k", tmpZip, binDir], { stdio: "inherit" });
  if (ditto.status !== 0) {
    console.error(
      "[get-pocketbase] could not unzip; please extract pocketbase into ./bin manually",
    );
    process.exit(1);
  }
}
rmSync(tmpZip, { force: true });
if (existsSync(binPath)) chmodSync(binPath, 0o755);
console.log("[get-pocketbase] ready at bin/pocketbase");
