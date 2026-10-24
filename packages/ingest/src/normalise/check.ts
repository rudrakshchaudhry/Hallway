// Prints record counts and per-field null rates for every data/clean/*.json, and validates
// the merged graph the way `pnpm seed` does. Usage: pnpm ingest:check
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeSnapshots, validateSnapshot } from '@hallway/types';
import { CLEAN_DIR } from './util.ts';

// Fields worth watching per label (missing = absent, null or empty).
const FIELDS: Record<string, string[]> = {
  Talk: ['abstract', 'room', 'end'],
  Person: ['headline', 'linkedin', 'avatar', 'about', 'role'],
  PastTalk: ['url', 'year'],
  SideEvent: ['end', 'venue', 'url'],
  Company: [],
  Conference: ['venue', 'url'],
};

type Raw = { nodes: Record<string, unknown>[]; edges: { type: string }[] };
const files = (await readdir(CLEAN_DIR).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
if (!files.length) throw new Error(`no clean files in ${CLEAN_DIR}`);

const parts: Raw[] = [];
for (const f of files) {
  const snap = JSON.parse(await readFile(join(CLEAN_DIR, f), 'utf8')) as Raw;
  parts.push(snap);
  validateSnapshot(snap);
  const byLabel = new Map<string, Record<string, unknown>[]>();
  for (const n of snap.nodes) byLabel.set(String(n.label), [...(byLabel.get(String(n.label)) ?? []), n]);
  const edgeCounts = new Map<string, number>();
  for (const e of snap.edges) edgeCounts.set(e.type, (edgeCounts.get(e.type) ?? 0) + 1);
  console.log(`\n${f}: ${snap.nodes.length} nodes, ${snap.edges.length} edges`);
  for (const [label, nodes] of byLabel) {
    const rates = (FIELDS[label] ?? []).map((k) => {
      const missing = nodes.filter((n) => n[k] === undefined || n[k] === null || n[k] === '').length;
      return `${k} ${Math.round((100 * missing) / nodes.length)}% null`;
    });
    console.log(`  ${label.padEnd(10)} ${String(nodes.length).padStart(4)}${rates.length ? `  (${rates.join(', ')})` : ''}`);
  }
  console.log(`  edges: ${[...edgeCounts].map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`);
}

const merged = validateSnapshot(mergeSnapshots(parts));
console.log(`\nmerged (as seeded): ${merged.nodes.length} nodes, ${merged.edges.length} edges — valid`);
