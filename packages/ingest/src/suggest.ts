import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateSnapshot, type GraphSnapshot } from "@hallway/types";
import { extractSnapshot, slugify } from "./extract.ts";
import { UnlockError, unlockPage } from "./unlock.ts";

export type Suggestion = {
  id: string;
  title: string;
  reason: string;
  start: string;
  room: string;
};

export type SuggestResult = {
  ok: boolean;
  message: string;
  source: "live" | "cache" | "none";
  suggestions: Suggestion[];
};

const FRESH_MS = 12 * 60 * 60 * 1000;

function repoRoot(): string {
  let dir = import.meta.dirname ?? process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const MESSAGES = {
  bad_url: "Enter the full conference link, starting with https://.",
  need_input: "Say what you want from the conference.",
  missing_key: "Scraping is not set up yet. Add the Bright Data API key and unlocker zone.",
  rejected_key: "The Bright Data API key was rejected.",
  bad_zone: "The Bright Data unlocker zone was not found.",
  timeout: "The conference site took too long to answer.",
  unlock_failed: "The conference site could not be opened.",
  empty_page: "The conference page came back empty.",
  no_events: "That page has no published sessions we can read.",
  invalid_page: "The sessions on that page were not usable.",
  no_match: "Nothing on that page matches what you wrote.",
} as const;

export async function suggestEvents(input: {
  url: string;
  intent: string;
  fetchPage?: (url: string) => Promise<string>;
  cache?: { snapshot: GraphSnapshot | null; fresh: boolean };
  persist?: boolean;
}): Promise<SuggestResult> {
  const intent = input.intent.trim();
  if (!intent) return { ok: false, message: MESSAGES.need_input, source: "none", suggestions: [] };
  let pageUrl: URL;
  try {
    pageUrl = new URL(input.url);
    if (pageUrl.protocol !== "https:" && pageUrl.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    return { ok: false, message: MESSAGES.bad_url, source: "none", suggestions: [] };
  }

  const stored = input.cache ?? readCache(pageUrl.toString());
  if (stored.fresh && stored.snapshot) {
    return finish(stored.snapshot, intent, "cache");
  }

  try {
    const html = await (input.fetchPage ?? unlockPage)(pageUrl.toString());
    const snapshot = extractSnapshot(html, pageUrl.toString());
    if (snapshot.nodes.every((node) => node.label !== "Talk")) {
      return stored.snapshot
        ? withCache(stored.snapshot, intent, MESSAGES.no_events)
        : { ok: false, message: MESSAGES.no_events, source: "none", suggestions: [] };
    }
    if (input.persist !== false) writeLive(pageUrl.toString(), html, snapshot);
    return finish(snapshot, intent, "live");
  } catch (error) {
    const message = error instanceof UnlockError ? MESSAGES[error.code] : MESSAGES.invalid_page;
    if (stored.snapshot) return withCache(stored.snapshot, intent, message);
    return { ok: false, message, source: "none", suggestions: [] };
  }
}

function finish(snapshot: GraphSnapshot, intent: string, source: "live" | "cache"): SuggestResult {
  const suggestions = matchIntent(snapshot, intent);
  if (suggestions.length === 0) {
    return { ok: true, message: MESSAGES.no_match, source, suggestions };
  }
  const prefix = source === "cache" ? "Showing the saved conference. " : "";
  return { ok: true, message: `${prefix}${suggestions.length} sessions match what you wrote.`, source, suggestions };
}

function withCache(snapshot: GraphSnapshot, intent: string, failure: string): SuggestResult {
  const matched = matchIntent(snapshot, intent);
  return {
    ok: true,
    message: `${failure} Showing the last saved copy.`,
    source: "cache",
    suggestions: matched,
  };
}

export function matchIntent(snapshot: GraphSnapshot, intent: string): Suggestion[] {
  const words = intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
  return snapshot.nodes
    .flatMap((node) => {
      if (node.label !== "Talk") return [];
      const haystack = `${node.title} ${node.abstract}`.toLowerCase();
      const hits = words.filter((word) => haystack.includes(word));
      if (hits.length === 0) return [];
      return [{
        id: node.id,
        title: node.title,
        reason: `Matches ${hits.join(", ")}`,
        start: node.start,
        room: node.room ?? "",
        score: hits.length,
      }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _score, ...suggestion }) => suggestion);
}

function readCache(url: string): { snapshot: GraphSnapshot | null; fresh: boolean } {
  const file = path.join(repoRoot(), "data/live", `suggest-${slugify(new URL(url).hostname.replace(/^www\./, ""))}.json`);
  try {
    const snapshot = validateSnapshot(JSON.parse(readFileSync(file, "utf8")));
    return { snapshot, fresh: Date.now() - statSync(file).mtimeMs < FRESH_MS };
  } catch {
    return { snapshot: null, fresh: false };
  }
}

function writeLive(url: string, html: string, snapshot: GraphSnapshot) {
  const slug = slugify(new URL(url).hostname.replace(/^www\./, ""));
  const rawDir = path.join(repoRoot(), "data/raw");
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(path.join(rawDir, `${slug}-${Date.now()}.html`), html);
  const clean = path.join(repoRoot(), "data/live", `suggest-${slug}.json`);
  mkdirSync(path.dirname(clean), { recursive: true });
  writeFileSync(clean, JSON.stringify(snapshot, null, 2));
}
