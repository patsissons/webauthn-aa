import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Monorepo apps share the repo-root .env / .env.local. Load them into the
// server process env (secrets stay server-side; only NEXT_PUBLIC_* reach the client).
const repoRoot = join(process.cwd(), "..", "..");
loadEnv({ path: join(repoRoot, ".env") });
loadEnv({ path: join(repoRoot, ".env.local"), override: true });

const rpOrigin = process.env.NEXT_PUBLIC_RP_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  transpilePackages: ["@webauthn-aa/contracts", "@webauthn-aa/constraints"],
  // The repo-root schema snapshot is read at runtime to bootstrap an empty
  // instance (apps/aa/lib/bootstrap.ts). Pin the trace root to the monorepo root
  // and include it so it ships in the serverless bundle on Vercel.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: { "/**": ["../../pocketbase/aa/schema.json"] },
  async headers() {
    // Allow ONLY the RP origin to embed the capture page in a dialog iframe.
    return [
      {
        source: "/capture",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self' ${rpOrigin}` }],
      },
    ];
  },
};

export default nextConfig;
