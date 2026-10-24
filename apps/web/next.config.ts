import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env at the repo root is shared by every package and session.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."));

const nextConfig: NextConfig = {
  transpilePackages: ["@hallway/types", "@hallway/graph"],
  // The falkordb client is Node-only; keep it out of the bundle.
  serverExternalPackages: ["falkordb"],
  // Lets phones reach the dev server through the Cloudflare quick tunnel.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
