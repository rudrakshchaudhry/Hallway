// Calls every route the demo uses; fails on errors, schema mismatches or responses over 2 s.
// Integration adds the demo routes from docs/PLAN.md section 5.3 (chat, profile, feed, people, invites, agenda, past).
import { HealthResponse } from "../packages/types/src/index.ts";
import type { ZodType } from "zod";

const base = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const LIMIT_MS = 2000;

const checks: { path: string; schema: ZodType }[] = [{ path: "/api/health", schema: HealthResponse }];

let failed = 0;
for (const { path, schema } of checks) {
  const start = performance.now();
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(LIMIT_MS) });
    const parsed = schema.safeParse(await res.json());
    const ms = Math.round(performance.now() - start);
    const ok = res.ok && parsed.success && ms <= LIMIT_MS;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${path} ${res.status} ${ms}ms${parsed.success ? "" : " schema mismatch"}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${path} ${(err as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
