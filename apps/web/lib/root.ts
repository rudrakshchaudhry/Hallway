import { existsSync } from "node:fs";
import path from "node:path";

/** Repo root (the folder with pnpm-workspace.yaml), wherever next dev was started. */
export function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
  return dir;
}
