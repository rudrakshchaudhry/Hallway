// Smoke test: calls every read route the app depends on and fails on errors, schema
// mismatches or responses slower than 2 s (streams: time to first event). Requests carry no
// identity cookie, so routes answer for the demo persona.
import {
  AgendaResponse,
  ChatEvent,
  ConferencesResponse,
  ExploreResponse,
  FeedResponse,
  HealthResponse,
  PastGraphResponse,
  PeopleResponse,
} from "../packages/types/src/index.ts";
import type { ZodType } from "zod";

const base = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const LIMIT_MS = 2000;

type Check = {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** NDJSON streams are timed to their first event, not the whole stream. */
  stream?: boolean;
  schema?: ZodType;
};

const checks: Check[] = [
  { path: "/api/health", schema: HealthResponse },
  { path: "/api/conferences", schema: ConferencesResponse },
  { path: "/api/chat", method: "POST", body: { message: "" }, stream: true, schema: ChatEvent },
  { path: "/api/feed", schema: FeedResponse },
  { path: "/api/people", schema: PeopleResponse },
  { path: "/api/agenda", schema: AgendaResponse },
  { path: "/api/explore", schema: ExploreResponse },
  { path: "/api/past", schema: PastGraphResponse },
];

async function run({ path, method = "GET", body, stream, schema }: Check) {
  const start = performance.now();
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(LIMIT_MS * 2),
  });
  let payload: unknown;
  if (stream) {
    const reader = res.body?.getReader();
    const first = reader ? await reader.read() : undefined;
    await reader?.cancel();
    const line = new TextDecoder().decode(first?.value ?? new Uint8Array()).split("\n")[0] ?? "";
    payload = line ? JSON.parse(line) : undefined;
  } else {
    payload = await res.json();
  }
  const ms = Math.round(performance.now() - start);
  const schemaOk = schema ? schema.safeParse(payload).success : payload !== undefined;
  return { ok: res.ok && schemaOk && ms <= LIMIT_MS, status: res.status, ms, schemaOk };
}

let failed = 0;
for (const check of checks) {
  try {
    const { ok, status, ms, schemaOk } = await run(check);
    if (!ok) failed++;
    const notes = [schemaOk ? "" : "schema mismatch", ms > LIMIT_MS ? "slow" : ""].filter(Boolean).join(", ");
    console.log(`${ok ? "PASS" : "FAIL"} ${check.method ?? "GET"} ${check.path} ${status} ${ms}ms ${notes}`.trimEnd());
  } catch (err) {
    failed++;
    console.log(`FAIL ${check.method ?? "GET"} ${check.path} ${(err as Error).message}`);
  }
}
console.log(failed ? `${failed} of ${checks.length} checks failed` : `All ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
