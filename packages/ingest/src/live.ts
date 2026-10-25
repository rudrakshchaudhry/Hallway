import { mergeSnapshots, validateSnapshot, type Conference, type GraphSnapshot, type IngestStage } from "@hallway/types";
import { unlocker } from "./brightdata.ts";
import { extractSnapshot, slugify } from "./extract.ts";
import { chatJson, htmlToText } from "./openai.ts";

// Live ingest of a conference Hallway doesn't have yet (PLAN.md 7.3). Every Bright Data call goes
// through the budget guard (unlocker → budget.reserve); each stage is time-boxed and a failed
// stage is recorded and skipped, never fatal.

export type LiveProgress = { stage: IngestStage; note: string; counts: Record<string, number>; error?: string };
type Report = (p: LiveProgress) => void;

const MAX_TALKS = 150;
const MAX_EVENTS = 30;

type Meta = { name: string; officialUrl: string; agendaUrl: string | null; start: string; end: string; city: string | null; venue: string | null; tz: string };
type RawTalk = { title: string; abstract?: string; kind?: string; start: string; end?: string; room?: string; topics?: string[]; speakers?: { name: string; title?: string; company?: string }[] };

const KINDS = new Set(["talk", "workshop", "keynote", "panel", "other"]);
const withTimeout = <T>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);

/** Fetches a page; if it's a JavaScript shell (little readable text), refetches it rendered. */
async function fetchPage(url: string, { render = false } = {}): Promise<string> {
  const res = await unlocker(url, { timeoutMs: render ? 75_000 : 45_000, ...(render ? { expect: { element: "body" }, retry: false } : {}) });
  if (res.status >= 400 || !res.body) throw new Error(`fetch ${url} → ${res.status}`);
  if (!render && htmlToText(res.body, 5_000).length < 1_500) {
    try {
      return await fetchPage(url, { render: true });
    } catch {
      return res.body;
    }
  }
  return res.body;
}

/** Find: the official site and the agenda page, plus dates, city, venue and time zone. */
async function findConference(query: { name?: string; url?: string }): Promise<Meta> {
  let officialUrl = query.url;
  if (!officialUrl) {
    const html = await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query.name} conference 2026 agenda`)}`);
    const links = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => {
        const raw = m[1] ?? "";
        const uddg = raw.match(/uddg=([^&]+)/)?.[1];
        return { url: uddg ? decodeURIComponent(uddg) : raw, title: htmlToText(m[2] ?? "", 200) };
      })
      .filter((l) => l.url.startsWith("https://"))
      .slice(0, 10);
    if (!links.length) throw new Error("no search results");
    const pick = await chatJson<{ officialUrl: string | null }>(
      'Pick the official website of the named conference from search results. Return {"officialUrl": string|null}. Never pick news, ticket resellers or aggregators.',
      `Conference: ${query.name}\nResults:\n${links.map((l, i) => `${i + 1}. ${l.title} — ${l.url}`).join("\n")}`,
    );
    if (!pick.officialUrl) throw new Error("couldn't identify the official site");
    officialUrl = pick.officialUrl;
  }
  const home = await fetchPage(officialUrl);
  const links = [...home.matchAll(/href="([^"#]+)"[^>]*>([^<]{2,60})</g)]
    .map((m) => ({ href: new URL(m[1] ?? "", officialUrl).toString(), text: m[2]?.trim() ?? "" }))
    .filter((l) => /agenda|schedule|program|sessions|speakers/i.test(`${l.href} ${l.text}`))
    .slice(0, 15);
  const meta = await chatJson<Omit<Meta, "officialUrl">>(
    `Read a conference website and return JSON only:
{"name": string, "agendaUrl": string|null, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "city": string|null, "venue": string|null, "tz": IANA time zone of the venue, e.g. "America/New_York"}.
Use facts on the page for name, dates, city and venue; pick agendaUrl from the candidate links (schedule/agenda/sessions), or null. Derive tz from the city (never "UTC" unless the event is online-only).`,
    `URL: ${officialUrl}\nCandidate links:\n${links.map((l) => `${l.text} — ${l.href}`).join("\n")}\n\nPage text:\n${htmlToText(home, 20_000)}`,
  );
  if (!meta.start || !meta.end) throw new Error("couldn't find the conference dates");
  return { ...meta, officialUrl, tz: meta.tz || "UTC" };
}

/** Sessions: schema.org data first (exact), then LLM extraction of the agenda page. */
async function readSessions(meta: Meta, confId: string): Promise<GraphSnapshot> {
  const url = meta.agendaUrl ?? meta.officialUrl;
  const html = await fetchPage(url);
  try {
    const fromLd = extractSnapshot(html, url);
    if (fromLd.nodes.filter((n) => n.label === "Talk").length >= 5) return linkToConference(fromLd, confId);
  } catch {
    // no usable JSON-LD; fall through to the model
  }
  const out = await chatJson<{ sessions: RawTalk[] }>(
    `Extract the conference sessions from an agenda page. Return JSON only: {"sessions": [{"title", "abstract", "kind": talk|workshop|keynote|panel|other, "start": ISO 8601 with UTC offset, "end": ISO 8601 with UTC offset or null, "room", "topics": [1-3 short topics], "speakers": [{"name", "title", "company"}]}]}.
The conference runs ${meta.start} to ${meta.end} in time zone ${meta.tz}; convert local times with that zone's offset. Skip breaks, lunches and sessions without a time. At most ${MAX_TALKS}. Use only what the page says.`,
    htmlToText(html),
    { timeoutMs: 150_000 },
  );
  return snapshotFromTalks(out.sessions ?? [], confId);
}

function linkToConference(snapshot: GraphSnapshot, confId: string): GraphSnapshot {
  const talks = snapshot.nodes.filter((n) => n.label === "Talk").slice(0, MAX_TALKS);
  return { nodes: [...snapshot.nodes], edges: [...snapshot.edges, ...talks.map((t) => ({ type: "PART_OF" as const, from: t.id, to: confId }))] };
}

export function snapshotFromTalks(talks: RawTalk[], confId: string): GraphSnapshot {
  const nodes: GraphSnapshot["nodes"] = [];
  const edges: GraphSnapshot["edges"] = [];
  const confSlug = confId.slice("conf:".length);
  for (const [i, t] of talks.slice(0, MAX_TALKS).entries()) {
    const start = Date.parse(t.start);
    if (!t.title || Number.isNaN(start)) continue;
    const kind = (KINDS.has(t.kind ?? "") ? t.kind : "talk") as "talk" | "workshop" | "keynote" | "panel" | "other";
    const endMs = t.end && !Number.isNaN(Date.parse(t.end)) && Date.parse(t.end) > start ? Date.parse(t.end) : start + (kind === "workshop" ? 90 : 45) * 60_000;
    const id = `talk:${confSlug}-${i}-${slugify(t.title).slice(0, 50)}`;
    nodes.push({ label: "Talk", id, title: t.title, abstract: (t.abstract ?? "").slice(0, 1000), kind, start: t.start, end: new Date(endMs).toISOString(), ...(t.room ? { room: t.room } : {}) });
    edges.push({ type: "PART_OF", from: id, to: confId });
    for (const topic of (t.topics ?? []).slice(0, 3)) {
      const tid = `topic:${slugify(topic)}`;
      nodes.push({ label: "Topic", id: tid, name: topic });
      edges.push({ type: "ABOUT", from: id, to: tid });
    }
    for (const s of t.speakers ?? []) {
      if (!s.name) continue;
      const handle = slugify(s.name);
      const pid = `person:${handle}`;
      nodes.push({ label: "Person", id: pid, handle, name: s.name, ...(s.title ? { headline: s.title } : {}), optedIn: false, isUser: false });
      edges.push({ type: "SPEAKS_AT", from: pid, to: id });
      if (s.company) {
        const cid = `company:${slugify(s.company)}`;
        nodes.push({ label: "Company", id: cid, name: s.company });
        edges.push({ type: "WORKS_AT", from: pid, to: cid });
      }
    }
  }
  return { nodes, edges };
}

type LumaEntry = {
  api_id: string;
  event: { name: string; start_at: string; end_at?: string | null; url: string; visibility?: string; geo_address_info?: { full_address?: string; address?: string } | null };
  hosts?: { api_id: string; name: string; username?: string | null }[];
};

/** Side events: the Luma city page (public events and hosts only), conference dates ±1 day. */
async function readSideEvents(meta: Meta, confId: string): Promise<GraphSnapshot> {
  if (!meta.city) return { nodes: [], edges: [] };
  const html = (await unlocker(`https://luma.com/${slugify(meta.city.split(",")[0] ?? meta.city)}`, { expect: { text: "__NEXT_DATA__" }, timeoutMs: 45_000 })).body;
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m?.[1]) return { nodes: [], edges: [] };
  const entries = ((JSON.parse(m[1]) as { props?: { pageProps?: { initialData?: { data?: { events?: LumaEntry[] } } } } }).props?.pageProps?.initialData?.data?.events ?? []) as LumaEntry[];
  const from = Date.parse(`${meta.start}T00:00:00Z`) - 86_400_000;
  const to = Date.parse(`${meta.end}T23:59:59Z`) + 86_400_000;
  const nodes: GraphSnapshot["nodes"] = [];
  const edges: GraphSnapshot["edges"] = [];
  for (const e of entries.filter((x) => x.event.visibility !== "private" && Date.parse(x.event.start_at) >= from && Date.parse(x.event.start_at) <= to).slice(0, MAX_EVENTS)) {
    const id = `event:luma-${slugify(e.event.url)}`;
    const venue = e.event.geo_address_info?.full_address ?? e.event.geo_address_info?.address;
    nodes.push({ label: "SideEvent", id, name: e.event.name, start: e.event.start_at, ...(e.event.end_at ? { end: e.event.end_at } : {}), ...(venue ? { venue } : {}), url: `https://luma.com/${e.event.url}`, source: "luma" });
    edges.push({ type: "NEAR", from: id, to: confId });
    for (const h of (e.hosts ?? []).slice(0, 3)) {
      const handle = `luma-${slugify(h.username ?? h.name)}`;
      nodes.push({ label: "Person", id: `person:${handle}`, handle, name: h.name, optedIn: false, isUser: false });
      edges.push({ type: "HOSTS", from: `person:${handle}`, to: id });
    }
  }
  return { nodes, edges };
}

/** Runs every stage and returns a validated snapshot for the new conference. */
export async function runLiveIngest(query: { name?: string; url?: string }, report: Report): Promise<{ conference: Conference; snapshot: GraphSnapshot }> {
  const counts: Record<string, number> = {};
  report({ stage: "find", note: query.url ? "Reading the conference site…" : `Searching for ${query.name}…`, counts });
  const meta = await withTimeout(findConference(query), 150_000, "finding the conference");
  const confId = `conf:${slugify(`${meta.name}-${meta.start.slice(0, 4)}`)}`;
  // Local wall time at the venue → ISO with that day's UTC offset.
  const offset = (day: string, time: string) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: meta.tz, timeZoneName: "longOffset" }).formatToParts(Date.parse(`${day}T12:00:00Z`)).find((x) => x.type === "timeZoneName")?.value;
    const off = name?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "+00:00";
    return `${day}T${time}${off}`;
  };
  const conference: Conference = {
    label: "Conference",
    id: confId,
    name: meta.name,
    start: offset(meta.start, "09:00:00"),
    end: offset(meta.end, "18:00:00"),
    ...(meta.city ? { city: meta.city } : {}),
    ...(meta.venue ? { venue: meta.venue } : {}),
    tz: meta.tz,
    url: meta.officialUrl,
    source: "live",
    status: "ready",
  };
  report({ stage: "sessions", note: `Found ${meta.name} (${meta.start} → ${meta.end}${meta.city ? `, ${meta.city}` : ""}). Reading the agenda…`, counts });

  const parts: GraphSnapshot[] = [{ nodes: [conference], edges: [] }];
  try {
    const sessions = await withTimeout(readSessions(meta, confId), 200_000, "reading sessions");
    parts.push(sessions);
    counts.sessions = sessions.nodes.filter((n) => n.label === "Talk").length;
    counts.speakers = new Set(sessions.edges.filter((e) => e.type === "SPEAKS_AT").map((e) => e.from)).size;
    report({ stage: "side-events", note: `Read ${counts.sessions} sessions and ${counts.speakers} speakers. Looking for side events…`, counts });
  } catch (err) {
    report({ stage: "side-events", note: "Couldn't read the sessions; looking for side events…", counts, error: (err as Error).message });
  }
  try {
    const events = await withTimeout(readSideEvents(meta, confId), 90_000, "reading side events");
    parts.push(events);
    counts.events = events.nodes.filter((n) => n.label === "SideEvent").length;
  } catch (err) {
    report({ stage: "side-events", note: "Couldn't read side events.", counts, error: (err as Error).message });
  }
  // A conference with no sessions isn't useful (and would clutter the conference list).
  if (!counts.sessions) throw new Error(`found ${meta.name} but couldn't read any sessions from ${meta.agendaUrl ?? meta.officialUrl}`);
  // Same-id nodes from different stages (repeated speakers, topics, the conference) merge.
  const snapshot = validateSnapshot(mergeSnapshots(parts));
  report({ stage: "done", note: `Ready: ${counts.sessions ?? 0} sessions, ${counts.speakers ?? 0} speakers, ${counts.events ?? 0} side events.`, counts });
  return { conference, snapshot };
}
