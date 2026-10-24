// Sample: GitHub Universe 2026 session catalog (RainFocus attendee portal).
//
// Findings (2026-10-24):
// - Catalog page: reg.githubuniverse.com/flow/github/universe26/attendee-portal/page/sessioncatalog
//   is a client-rendered RainFocus workflow SPA; the HTML has no sessions.
// - GET flow/loadPage?pageUri=sessioncatalog&workflowApiToken=github.universe26.attendee-portal
//   works unauthenticated and returns the page config: catalog widget id + apiProfileToken.
// - Sessions come from POST https://events.githubuniverse.com/api/search with headers
//   rfWidgetId / rfApiProfileId. The Unlocker zone returns an empty body for POST bodies and
//   needs "custom headers" enabled for target headers, so that route is closed for now.
// - Workflow GET routes (flow/common/sessions/*, flow/common/speaker/loadEventSpeakers) answer
//   error.api.invalid.csrf.token: the rfcsrf token is bound to the session cookie.
// - A rendered fetch (x-unblock-expect element [data-session-id]) fails with expect_element /
//   req_timeout: the widget never renders inside the Unlocker.
//
// This script records the reachable catalog config; pass --render to retry the rendered fetch
// (costs up to 2 Unlocker requests).
import { unlocker, usage } from '../brightdata.ts';
import { writeRaw } from '../paths.ts';

const PORTAL = 'https://reg.githubuniverse.com/flow/github/universe26/attendee-portal';
const LOAD_PAGE =
  'https://reg.githubuniverse.com/flow/loadPage?pageUri=sessioncatalog&workflowApiToken=github.universe26.attendee-portal';

interface LoadPage {
  data: {
    responseCode: string;
    timeZone?: string;
    eventsettings?: { eventStartDate?: string };
    widgetConf?: { widgetId: string; apiProfileToken: string; workflowId: string };
    eventsUrl?: string;
  };
}

const page = await unlocker(LOAD_PAGE, { expect: { text: '"responseCode"' } });
const parsed = JSON.parse(page.body) as LoadPage;
const catalogWidgetId = page.body.match(/id=\\"rf-catalog\\" data-widgetid=\\"(\w+)\\"/)?.[1] ?? null;

const result: Record<string, unknown> = {
  catalogPage: `${PORTAL}/page/sessioncatalog`,
  loadPage: LOAD_PAGE,
  responseCode: parsed.data.responseCode,
  timeZone: parsed.data.timeZone ?? null,
  eventStartDate: parsed.data.eventsettings?.eventStartDate ?? null,
  searchApi: `https://${parsed.data.eventsUrl ?? 'events.githubuniverse.com'}/api/search`,
  catalogWidgetId,
  apiProfileToken: parsed.data.widgetConf?.apiProfileToken ?? null,
  sessions: [] as unknown[],
  status: 'blocked: sessions load via api/search (POST + rfWidgetId/rfApiProfileId headers)',
};

if (process.argv.includes('--render')) {
  try {
    const rendered = await unlocker(`${PORTAL}/page/sessioncatalog`, {
      expect: { element: '[data-session-id]' },
      timeoutMs: 90_000,
    });
    result.renderedHtmlLength = rendered.body.length;
    result.status = 'rendered: parse [data-session-id] tiles';
  } catch (err) {
    result.renderError = String(err);
  }
}

const file = await writeRaw('sessions', result);
console.log(`${file}: ${result.status} (unlocker requests: ${usage.unlockerRequests})`);
