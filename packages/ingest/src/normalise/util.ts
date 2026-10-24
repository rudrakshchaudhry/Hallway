import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Edge, EDGE_PROPS, Node, validateSnapshot } from '@hallway/types';
import { DATA_DIR } from '../paths.ts';

export const CLEAN_DIR = join(DATA_DIR, 'clean');

/** Lowercase ascii slug; never empty, never contains "|". */
export function slug(s: string): string {
  const out = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || 'x';
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** HTML fragment to plain text. */
export function plainText(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#') && e !== '#39') return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Removes null, undefined and empty-string keys (shallow; edge props are flat). */
export function dropNulls<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')) as T;
}

/** "2026-10-28" + "13:30" → "2026-10-28T13:30:00-07:00" (Universe week is PDT). */
export function pacific(date: string, time: string): string {
  return `${date}T${time.length === 5 ? `${time}:00` : time}-07:00`;
}

/** UTC ISO → the same instant with a -07:00 offset. */
export function utcToPacific(iso: string): string {
  const d = new Date(Date.parse(iso) - 7 * 3600_000);
  return `${d.toISOString().slice(0, 19)}-07:00`;
}

export function isUrl(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(s).protocol);
  } catch {
    return false;
  }
}

type RawNode = Record<string, unknown> & { id: string; label: string };
type RawEdge = { type: string; from: string; to: string; props?: Record<string, string | number | boolean> };

/**
 * Collects one clean file. Each node and edge is validated against the contract on the way in
 * (bad ones are skipped and logged); the raw, null-dropped object is what gets written, so schema
 * defaults never overwrite another source's values when seed merges files.
 */
export class SnapshotBuilder {
  readonly nodes = new Map<string, RawNode>();
  readonly edges = new Map<string, RawEdge>();
  skipped = 0;

  constructor(readonly name: string) {}

  node(raw: Record<string, unknown>): string | undefined {
    const clean = dropNulls(raw) as RawNode;
    const parsed = Node.safeParse(clean);
    if (!parsed.success) {
      this.skip(`node ${String(clean.id)}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      return undefined;
    }
    this.nodes.set(clean.id, { ...this.nodes.get(clean.id), ...clean });
    return clean.id;
  }

  edge(type: string, from: string | undefined, to: string | undefined, props?: Record<string, unknown>): void {
    if (!from || !to) return;
    const p = props ? (dropNulls(props) as Record<string, string | number | boolean>) : undefined;
    const raw: RawEdge = { type, from, to, ...(p && Object.keys(p).length ? { props: p } : {}) };
    const parsed = Edge.safeParse(raw);
    const rule = parsed.success ? EDGE_PROPS[parsed.data.type] : undefined;
    if (!parsed.success || (rule && !rule.safeParse(raw.props ?? {}).success)) {
      this.skip(`edge ${from}|${type}|${to}: invalid`);
      return;
    }
    this.edges.set(`${from}|${type}|${to}`, raw);
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  private skip(msg: string): void {
    this.skipped++;
    console.warn(`[${this.name}] skip ${msg}`);
  }

  /** Drops edges whose endpoints aren't in this file, validates the whole file, writes it. */
  async write(): Promise<{ file: string; nodes: number; edges: number; skipped: number }> {
    for (const [key, e] of this.edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) {
        this.edges.delete(key);
        this.skip(`edge ${key}: endpoint not in file`);
      }
    }
    const snapshot = { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
    validateSnapshot(snapshot);
    await mkdir(CLEAN_DIR, { recursive: true });
    const file = join(CLEAN_DIR, `${this.name}.json`);
    await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
    return { file, nodes: snapshot.nodes.length, edges: snapshot.edges.length, skipped: this.skipped };
  }
}
