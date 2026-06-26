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
  // The repo-root config/regions.json is read at runtime via readFileSync
  // (apps/rp/lib/regions.ts). Pin the trace root to the monorepo root and
  // include that file so it ships in the serverless bundle on Vercel (where the
  // Root Directory is apps/rp); otherwise region resolution 500s at runtime.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/**": ["../../config/regions.json", "../../pocketbase/rp/schema.json"],
  },
};

export default nextConfig;
