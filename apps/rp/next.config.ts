import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Monorepo apps share the repo-root .env / .env.local. Load them into the
// server process env (secrets stay server-side; only NEXT_PUBLIC_* reach the client).
const repoRoot = join(process.cwd(), "..", "..");
loadEnv({ path: join(repoRoot, ".env") });
loadEnv({ path: join(repoRoot, ".env.local"), override: true });

const nextConfig: NextConfig = {
  transpilePackages: ["@webauthn-aa/contracts", "@webauthn-aa/constraints"],
};

export default nextConfig;
