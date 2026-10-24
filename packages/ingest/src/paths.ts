import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, resolved from this file so scripts work from any cwd. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DATA_DIR = join(REPO_ROOT, 'data');
export const RAW_DIR = join(DATA_DIR, 'raw');
export const LIVE_DIR = join(DATA_DIR, 'live');

/** Writes `data/raw/<source>-<timestamp>.json` and returns the path. */
export async function writeRaw(source: string, payload: unknown): Promise<string> {
  await mkdir(RAW_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(RAW_DIR, `${source}-${ts}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

/** Reads the newest `data/raw/<source>-*.json`, or null when none exists. */
export async function readLatestRaw<T>(source: string): Promise<T | null> {
  const files = (await readdir(RAW_DIR).catch(() => [] as string[]))
    .filter((f) => f.startsWith(`${source}-`) && f.endsWith('.json'))
    .sort();
  const latest = files.at(-1);
  return latest ? (JSON.parse(await readFile(join(RAW_DIR, latest), 'utf8')) as T) : null;
}
