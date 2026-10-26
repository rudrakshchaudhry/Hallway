import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./root";

// DEMO_CACHE=record saves results to data/cache/<key>.json; DEMO_CACHE=1 replays them (docs/ARCHITECTURE.md#configuration).
export async function cached<T>(namespace: string, input: unknown, compute: () => Promise<T>): Promise<T> {
  const mode = process.env.DEMO_CACHE;
  if (mode !== "1" && mode !== "record") return compute();
  const key = createHash("sha256").update(JSON.stringify([namespace, input])).digest("hex").slice(0, 24);
  const file = path.join(repoRoot(), "data/cache", `${namespace}-${key}.json`);
  if (mode === "1" && existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  const value = await compute();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 1));
  return value;
}
