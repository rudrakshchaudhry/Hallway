// Sample: GitHub Universe 2026 sessions from the RainFocus catalog.
//
// Route (found 2026-10-24):
// 1. GET  reg.githubuniverse.com/flow/loadPage?pageUri=sessioncatalog&workflowApiToken=github.universe26.attendee-portal
//    -> catalog widget id (div#rf-catalog data-widgetid) + widgetConf.apiProfileToken. Unauthenticated.
// 2. POST events.githubuniverse.com/api/search (form body) with headers rfWidgetId / rfApiProfileId
//    -> sessions. Needs "Custom headers & cookies" enabled on the Unlocker zone.
// Workflow GET routes (flow/common/sessions/*) are CSRF-bound and the rendered catalog never loads
// in the Unlocker, so this is the only working route.
//
// Usage: pnpm sample:sessions [--size N]   (default 3; writes the raw items, not a full run)
import { unlocker, usage } from '../brightdata.ts';
import { readLatestRaw, writeRaw } from '../paths.ts';

const LOAD_PAGE =
  'https://reg.githubuniverse.com/flow/loadPage?pageUri=sessioncatalog&workflowApiToken=github.universe26.attendee-portal';
const SEARCH = 'https://events.githubuniverse.com/api/search';

interface CatalogConfig {
  catalogWidgetId: string;
  apiProfileToken: string;
}

async function catalogConfig(): Promise<CatalogConfig> {
  const cached = await readLatestRaw<Partial<CatalogConfig>>('sessions');
  if (cached?.catalogWidgetId && cached.apiProfileToken) {
    return { catalogWidgetId: cached.catalogWidgetId, apiProfileToken: cached.apiProfileToken };
  }
  const page = await unlocker(LOAD_PAGE, { expect: { text: '"responseCode"' } });
  const widget = page.body.match(/id=\\"rf-catalog\\" data-widgetid=\\"(\w+)\\"/)?.[1];
  const token = (JSON.parse(page.body) as { data: { widgetConf?: { apiProfileToken?: string } } }).data
    .widgetConf?.apiProfileToken;
  if (!widget || !token) throw new Error('sessions: catalog widget id or apiProfileToken not found');
  return { catalogWidgetId: widget, apiProfileToken: token };
}

export interface SearchSection {
  total?: number;
  size?: number;
  numItems?: number;
  items?: Record<string, unknown>[];
}

/** One api/search page. RainFocus returns either sectionList[] or items at the top level. */
export async function searchSessions(
  cfg: CatalogConfig,
  from: number,
  size: number,
): Promise<{ raw: Record<string, unknown>; section: SearchSection }> {
  const body = new URLSearchParams({ type: 'session', search: '', from: String(from), size: String(size) });
  const res = await unlocker(SEARCH, {
    method: 'POST',
    body: body.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      rfWidgetId: cfg.catalogWidgetId,
      rfApiProfileId: cfg.apiProfileToken,
    },
    retry: false,
  });
  const raw = JSON.parse(res.body) as Record<string, unknown> & { sectionList?: SearchSection[] };
  const section = raw.sectionList?.find((s) => Array.isArray(s.items)) ?? (raw as SearchSection);
  return { raw, section };
}

const sizeArg = process.argv.indexOf('--size');
const size = sizeArg >= 0 ? Number(process.argv[sizeArg + 1]) : 3;
const cfg = await catalogConfig();
const { raw, section } = await searchSessions(cfg, 0, size);
const items = (section.items ?? []).slice(0, size);

const file = await writeRaw('sessions', {
  ...cfg,
  searchApi: SEARCH,
  fetchedAt: new Date().toISOString(),
  responseCode: raw.responseCode ?? null,
  total: section.total ?? null,
  pageSize: section.size ?? null,
  topLevelKeys: Object.keys(raw),
  sessions: items,
});
console.log(`${file}: ${items.length} sessions, total=${section.total ?? '?'} (unlocker requests: ${usage.unlockerRequests})`);
