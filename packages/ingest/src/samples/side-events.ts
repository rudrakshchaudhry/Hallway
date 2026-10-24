// Public Luma SF events in Universe week (Oct 27–30, Pacific). Sample: 3 from luma.com/sf.
// --full: up to 30, paging api2.luma.com/discover/get-paginated-events (50 per page) until the
// window ends. Public event data and hosts only; guest fields are dropped before writing.
// Usage: pnpm sample:side-events [--full] [--from <data/raw/probe-*.json with a saved body>]
import { readFile } from 'node:fs/promises';
import { unlocker, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';

const URL_SF = 'https://luma.com/sf';
const WINDOW_START = Date.parse('2026-10-27T00:00:00-07:00');
const WINDOW_END = Date.parse('2026-10-31T00:00:00-07:00');
const FULL = process.argv.includes('--full');
const LIMIT = FULL ? 30 : 3;
const MAX_PAGES = 4;
const PLACE_API = 'https://api2.luma.com/discover/get-paginated-events';

interface LumaHost {
  api_id?: string;
  name?: string;
  username?: string | null;
  linkedin_handle?: string | null;
  twitter_handle?: string | null;
  website?: string | null;
}

interface LumaEntry {
  api_id: string;
  event: {
    name: string;
    start_at: string;
    end_at?: string;
    timezone?: string;
    url: string;
    location_type?: string;
    visibility?: string;
    geo_address_info?: { full_address?: string; address?: string; city_state?: string; mode?: string };
  };
  calendar?: { name?: string; slug?: string; api_id?: string };
  hosts?: LumaHost[];
}

async function loadHtml(): Promise<string> {
  const i = process.argv.indexOf('--from');
  const from = i >= 0 ? process.argv[i + 1] : undefined;
  if (from) return (JSON.parse(await readFile(from, 'utf8')) as { body: string }).body;
  return (await unlocker(URL_SF, { expect: { text: '__NEXT_DATA__' } })).body;
}

function placeAndEntries(html: string): { placeId?: string; kind: string; entries: LumaEntry[] } {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error('luma: __NEXT_DATA__ not found');
  const next = JSON.parse(m[1]) as {
    props: {
      pageProps: { initialData: { kind: string; data: { place?: { api_id?: string }; events?: LumaEntry[] } } };
    };
  };
  const { kind, data } = next.props.pageProps.initialData;
  return { placeId: data.place?.api_id, kind, entries: data.events ?? [] };
}

/** Pages the discover API for the place until past the window (or MAX_PAGES). */
async function pagedEntries(placeId: string): Promise<LumaEntry[]> {
  const out: LumaEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ discover_place_api_id: placeId, pagination_limit: '50' });
    if (cursor) q.set('pagination_cursor', cursor);
    const res = await unlocker(`${PLACE_API}?${q}`, { expect: { text: '"entries"' } });
    const body = JSON.parse(res.body) as { entries?: LumaEntry[]; has_more?: boolean; next_cursor?: string };
    out.push(...(body.entries ?? []));
    const last = body.entries?.at(-1);
    if (!body.has_more || !body.next_cursor || (last && Date.parse(last.event.start_at) >= WINDOW_END)) break;
    cursor = body.next_cursor;
  }
  return out;
}

const html = await loadHtml();
const first = placeAndEntries(html);
const all = FULL && first.placeId ? await pagedEntries(first.placeId) : first.entries;

const seenIds = new Set<string>();
const inWeek = all.filter((e) => {
  const t = Date.parse(e.event.start_at);
  if (seenIds.has(e.api_id)) return false;
  seenIds.add(e.api_id);
  return t >= WINDOW_START && t < WINDOW_END && e.event.visibility !== 'private';
});

const events = inWeek.slice(0, LIMIT).map((e) => ({
  id: e.api_id,
  name: e.event.name,
  start: e.event.start_at,
  end: e.event.end_at ?? null,
  timezone: e.event.timezone ?? null,
  venue:
    e.event.geo_address_info?.full_address ??
    e.event.geo_address_info?.address ??
    e.event.geo_address_info?.city_state ??
    null,
  locationType: e.event.location_type ?? null,
  url: `https://luma.com/${e.event.url}`,
  calendar: e.calendar ? { name: e.calendar.name, slug: e.calendar.slug } : null,
  hosts: (e.hosts ?? []).map((h) => ({
    id: h.api_id,
    name: h.name,
    username: h.username ?? null,
    linkedin: h.linkedin_handle ?? null,
    twitter: h.twitter_handle ?? null,
    website: h.website ?? null,
  })),
}));

const file = await writeRaw('side-events', {
  source: URL_SF,
  fetchedAt: new Date().toISOString(),
  pageKind: first.kind,
  entriesSeen: all.length,
  inUniverseWeek: inWeek.length,
  events,
});
console.log(`${file}: ${events.length} events (unlocker requests: ${usage.unlockerRequests})`);
for (const e of events) console.log(`- ${e.start} ${e.name} [${e.hosts.map((h) => h.name).join(', ')}]`);
