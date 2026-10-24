// Sample: 3 public Luma SF events in Universe week (Oct 27–30, Pacific).
// Public event data and hosts only; guest fields are dropped before writing.
// Usage: pnpm sample:side-events [--from <data/raw/probe-*.json with a saved body>]
import { readFile } from 'node:fs/promises';
import { unlocker, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';

const URL_SF = 'https://luma.com/sf';
const WINDOW_START = Date.parse('2026-10-27T00:00:00-07:00');
const WINDOW_END = Date.parse('2026-10-31T00:00:00-07:00');
const SAMPLE = 3;

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

const html = await loadHtml();
const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
if (!m?.[1]) throw new Error('luma: __NEXT_DATA__ not found');
const next = JSON.parse(m[1]) as {
  props: { pageProps: { initialData: { kind: string; data: { events?: LumaEntry[] } } } };
};
const all = next.props.pageProps.initialData.data.events ?? [];

const inWeek = all.filter((e) => {
  const t = Date.parse(e.event.start_at);
  return t >= WINDOW_START && t < WINDOW_END && e.event.visibility !== 'private';
});

const events = inWeek.slice(0, SAMPLE).map((e) => ({
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
  pageKind: next.props.pageProps.initialData.kind,
  totalOnPage: all.length,
  inUniverseWeek: inWeek.length,
  events,
});
console.log(`${file}: ${events.length} events (unlocker requests: ${usage.unlockerRequests})`);
for (const e of events) console.log(`- ${e.start} ${e.name} [${e.hosts.map((h) => h.name).join(', ')}]`);
