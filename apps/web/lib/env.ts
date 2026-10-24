import { loadEnvConfig } from "@next/env";
import { repoRoot } from "./root";

// next.config.ts loads the root .env, but route workers don't always inherit it, so every
// server module that reads secrets imports this first. Existing env vars are never overridden.
loadEnvConfig(repoRoot(), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error });
