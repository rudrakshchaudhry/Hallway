import type { NextConfig } from "next";

// One .env at the repo root is shared by every package and session: the dev/build/start
// scripts symlink it to apps/web/.env so Next loads it natively in every worker.

const nextConfig: NextConfig = {
  transpilePackages: ["@hallway/types", "@hallway/graph"],
  // The falkordb client is Node-only; keep it out of the bundle.
  serverExternalPackages: ["falkordb"],
  // Lets phones reach the dev server through the Cloudflare quick tunnel.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
