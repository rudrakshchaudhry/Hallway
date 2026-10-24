// Raw Universe files (data/raw, newest per source) → data/clean/<source>.json GraphSnapshots.
// Usage: pnpm --filter @hallway/ingest normalise
import { readLatestRaw } from '../paths.ts';
import { embed, cosine } from './embed.ts';
import { companyId, isCompany, kindOf, linkedinSlug, skillsIn } from './map.ts';
import { dropNulls, isUrl, pacific, plainText, slug, SnapshotBuilder, utcToPacific } from './util.ts';

const CONF_ID = 'conf:universe-2026';
const CONFERENCE = {
  label: 'Conference',
  id: CONF_ID,
  name: 'GitHub Universe 2026',
  start: '2026-10-28T09:00:00-07:00',
  end: '2026-10-29T18:00:00-07:00',
  city: 'San Francisco',
  venue: 'Fort Mason Center',
  tz: 'America/Los_Angeles',
  url: 'https://githubuniverse.com',
  source: 'snapshot',
  status: 'ready',
};
const GOALS = [
  ['networking', 'Networking'],
  ['learn', 'Learn a topic'],
  ['job', 'Find a job'],
  ['hire', 'Hire'],
  ['collaborate', 'Find collaborators'],
  ['fundraise', 'Fundraise'],
] as const;
const goalNode = (g: string, name: string) => ({ label: 'Goal', id: `goal:${g}`, name, goal: g });

// ---------- raw shapes (only the fields we read) ----------
interface RfTime { date?: string; endDate?: string; startTime?: string; endTime?: string; room?: string }
interface RfParticipant { fullName?: string; jobTitle?: string; companyName?: string; linkedIn?: string; photoURL?: string }
interface RfSession {
  sessionID: string;
  title?: string;
  code_id?: string;
  abstract?: string;
  type?: string;
  times?: RfTime[];
  participants?: RfParticipant[];
  attributevalues?: { attribute?: string; value?: string }[];
}
interface LiExperience { title?: string; company?: string; start_date?: string; end_date?: string }
interface LiProfile {
  input?: { url?: string };
  input_url?: string;
  error?: string;
  name?: string;
  position?: string;
  about?: string;
  avatar?: string;
  default_avatar?: boolean;
  current_company_name?: string;
  experience?: LiExperience[] | null;
}
interface YtVideo { video_id?: string; url?: string; title?: string; description?: string; youtuber?: string; date_posted?: string }
interface Job { company_name?: string; job_title?: string; job_summary?: string; error?: string }
interface SideEventRaw {
  id: string;
  name: string;
  start: string;
  end?: string | null;
  venue?: string | null;
  url: string;
  calendar?: { name?: string } | null;
  hosts: { id?: string; name?: string; username?: string | null; linkedin?: string | null }[];
}

// ---------- helpers ----------
// ---------- sessions ----------
interface SpeakerRef { id: string; node: Record<string, unknown>; company?: string; talkIds: string[] }

function buildSessions(sessions: RfSession[]) {
  const b = new SnapshotBuilder('sessions');
  const talks = new Map<string, Record<string, unknown>>();
  const speakers = new Map<string, SpeakerRef>(); // by full name
  const topicUse = new Map<string, { node: Record<string, unknown>; count: number }>();
  const companySpeakers = new Map<string, Set<string>>();
  b.node(CONFERENCE);

  const usedTalkIds = new Set<string>();
  for (const s of sessions) {
    const t = s.times?.[0];
    if (!s.title || !t?.date || !t.startTime) {
      console.warn(`[sessions] skip ${s.sessionID}: no title or time`);
      b.skipped++;
      continue;
    }
    let id = `talk:${slug(s.title)}`;
    if (usedTalkIds.has(id)) id = `${id}-${slug(s.code_id ?? s.sessionID)}`;
    usedTalkIds.add(id);
    const kind = kindOf(s.type);
    const start = pacific(t.date, t.startTime);
    const end = t.endTime
      ? pacific(t.endDate ?? t.date, t.endTime)
      : utcToPacific(new Date(Date.parse(start) + (kind === 'workshop' ? 90 : 45) * 60_000).toISOString());
    const talk = { label: 'Talk', id, title: s.title.trim(), abstract: plainText(s.abstract), kind, start, end, room: t.room };
    if (!b.node(talk)) continue;
    talks.set(s.sessionID, dropNulls(talk));
    b.edge('PART_OF', id, CONF_ID);

    for (const a of s.attributevalues ?? []) {
      if ((a.attribute !== 'Topic' && a.attribute !== 'Track') || !a.value?.trim()) continue;
      const name = a.value.trim();
      const topic = { label: 'Topic', id: `topic:${slug(name)}`, name };
      if (!b.node(topic)) continue;
      const prev = topicUse.get(topic.id);
      if (!b.edges.has(`${id}|ABOUT|${topic.id}`)) topicUse.set(topic.id, { node: topic, count: (prev?.count ?? 0) + 1 });
      b.edge('ABOUT', id, topic.id);
    }

    for (const p of s.participants ?? []) {
      if (!p.fullName?.trim()) continue;
      const name = p.fullName.trim();
      let ref = speakers.get(name);
      if (!ref) {
        const key = linkedinSlug(p.linkedIn) ?? slug(name);
        const node = {
          label: 'Person',
          id: `person:${key}`,
          handle: key,
          name,
          headline: p.jobTitle?.trim(),
          linkedin: p.linkedIn?.startsWith('https://www.linkedin.com/') ? p.linkedIn : undefined,
          avatar: isUrl(p.photoURL) ? p.photoURL : undefined,
        };
        if (!b.node(node)) continue;
        ref = { id: node.id, node: dropNulls(node), company: p.companyName?.trim(), talkIds: [] };
        speakers.set(name, ref);
        if (isCompany(ref.company)) {
          const cid = b.node({ label: 'Company', id: companyId(ref.company), name: ref.company });
          b.edge('WORKS_AT', ref.id, cid);
          if (cid) companySpeakers.set(cid, (companySpeakers.get(cid) ?? new Set()).add(ref.id));
        }
      }
      ref.talkIds.push(id);
      b.edge('SPEAKS_AT', ref.id, id);
    }
  }
  return { builder: b, talks, speakers, topicUse, companySpeakers };
}

// ---------- speakers (LinkedIn enrichment) ----------
function buildSpeakers(profiles: LiProfile[], speakers: Map<string, SpeakerRef>) {
  const b = new SnapshotBuilder('speakers');
  const byUrlSlug = new Map([...speakers.values()].map((s) => [linkedinSlug(s.node.linkedin as string | undefined), s]));
  for (const r of profiles) {
    const ref = byUrlSlug.get(linkedinSlug(r.input?.url ?? r.input_url));
    if (!ref || r.error) {
      if (r.error) console.warn(`[speakers] skip ${r.input?.url}: ${r.error}`);
      continue;
    }
    const { id, handle, name } = ref.node;
    b.node({
      label: 'Person',
      id,
      handle,
      name,
      about: r.about?.trim(),
      role: r.position?.trim(),
      // The catalog photo wins: LinkedIn image URLs expire.
      avatar: !ref.node.avatar && !r.default_avatar && isUrl(r.avatar) ? r.avatar : undefined,
    });
    const current = isCompany(ref.company) ? companyId(ref.company) : undefined;
    for (const e of r.experience ?? []) {
      if (!isCompany(e.company)) continue;
      const cid = companyId(e.company);
      if (cid === current) continue;
      b.node({ label: 'Company', id: cid, name: e.company.trim() });
      b.edge('WORKED_AT', id as string, cid, { from: e.start_date, to: e.end_date });
    }
  }
  return b;
}

// ---------- past talks ----------
async function buildPastTalks(
  matches: { speaker: string; video: YtVideo }[],
  speakers: Map<string, SpeakerRef>,
  talksById: Map<string, Record<string, unknown>>,
) {
  const b = new SnapshotBuilder('past-talks');
  const pairs: { talk: Record<string, unknown>; past: Record<string, unknown>; text: string }[] = [];
  for (const m of matches) {
    const ref = speakers.get(m.speaker);
    const v = m.video;
    if (!ref || !v.video_id || !v.title) continue;
    const year = v.date_posted ? new Date(v.date_posted).getUTCFullYear() : NaN;
    const past = {
      label: 'PastTalk',
      id: `pasttalk:yt-${v.video_id}`,
      title: v.title.trim(),
      conf: v.youtuber ? `YouTube ${v.youtuber}` : 'YouTube',
      year,
      url: `https://www.youtube.com/watch?v=${v.video_id}`,
    };
    if (!b.node(past) || !b.node(ref.node)) continue;
    b.edge('GAVE', ref.id, past.id);
    for (const tid of ref.talkIds) {
      const talk = talksById.get(tid);
      if (talk) pairs.push({ talk, past, text: `${v.title}\n${(v.description ?? '').slice(0, 2000)}` });
    }
  }
  if (pairs.length && process.env.OPENAI_API_KEY) {
    const talkText = (t: Record<string, unknown>) => `${String(t.title)}\n${String(t.abstract ?? '')}`;
    const vectors = await embed(pairs.flatMap((p) => [talkText(p.talk), p.text]));
    const scores = pairs.map((_, i) => cosine(vectors[2 * i]!, vectors[2 * i + 1]!));
    console.log(`[past-talks] ${pairs.length} talk/past-talk pairs, cosine max ${Math.max(...scores).toFixed(3)}`);
    pairs.forEach((p, i) => {
      const score = scores[i]!;
      if (score <= 0.8) return;
      b.node(p.talk);
      b.edge('SIMILAR_TO', p.talk.id as string, p.past.id as string, { score: Math.round(score * 1000) / 1000 });
    });
  } else if (pairs.length) {
    console.warn('[past-talks] OPENAI_API_KEY not set: no SIMILAR_TO edges');
  }
  return { builder: b, pairs: pairs.length };
}

// ---------- jobs ----------
function buildJobs(jobs: Job[]) {
  const b = new SnapshotBuilder('jobs');
  const skillUse = new Map<string, { node: Record<string, unknown>; count: number }>();
  for (const j of jobs) {
    if (j.error || !isCompany(j.company_name) || !j.job_title) continue;
    const cid = b.node({ label: 'Company', id: companyId(j.company_name), name: j.company_name.trim() });
    for (const name of skillsIn(`${j.job_title} ${j.job_summary ?? ''}`)) {
      const skill = { label: 'Skill', id: `skill:${slug(name)}`, name };
      b.node(skill);
      if (cid && !b.edges.has(`${cid}|HIRING_FOR|${skill.id}`)) {
        skillUse.set(skill.id, { node: skill, count: (skillUse.get(skill.id)?.count ?? 0) + 1 });
      }
      b.edge('HIRING_FOR', cid, skill.id);
    }
  }
  return { builder: b, skillUse };
}

// ---------- side events ----------
function buildSideEvents(events: SideEventRaw[], speakerHandles: Set<string>) {
  const b = new SnapshotBuilder('side-events');
  b.node(CONFERENCE);
  for (const e of events) {
    const id = b.node({
      label: 'SideEvent',
      id: `event:luma-${slug(e.url.split('/').pop() ?? e.id)}`,
      name: e.name.trim(),
      start: utcToPacific(e.start),
      end: e.end ? utcToPacific(e.end) : undefined,
      venue: e.venue ?? undefined,
      url: e.url,
      source: 'luma',
    });
    if (!id) continue;
    b.edge('NEAR', id, CONF_ID);
    // Luma hosts are user accounts (people, sometimes a brand's account); the calendar is the
    // organisation. Keys are prefixed "luma-" when they'd collide with a speaker handle or when
    // there is no username, so a host never merges into an unrelated speaker.
    for (const h of e.hosts) {
      if (!h.name?.trim()) continue;
      const base = h.username ? slug(h.username) : `luma-${slug(h.name)}`;
      const key = speakerHandles.has(base) ? `luma-${base}` : base;
      const linkedin = h.linkedin?.startsWith('/in/') ? `https://www.linkedin.com${h.linkedin}` : undefined;
      b.edge('HOSTS', b.node({ label: 'Person', id: `person:${key}`, handle: key, name: h.name.trim(), linkedin }), id);
    }
    const cal = e.calendar?.name?.trim();
    if (cal && cal.toLowerCase() !== 'personal') {
      b.edge('HOSTS', b.node({ label: 'Company', id: companyId(cal), name: cal }), id);
    }
  }
  return b;
}

// ---------- demo persona (fictional) ----------
function buildDemo(
  topicUse: Map<string, { node: Record<string, unknown>; count: number }>,
  skillUse: Map<string, { node: Record<string, unknown>; count: number }>,
  companySpeakers: Map<string, Set<string>>,
  companies: Map<string, Record<string, unknown>>,
) {
  const b = new SnapshotBuilder('demo');
  const me = b.node({
    label: 'Person',
    id: 'person:demo',
    handle: 'demo',
    name: 'Demo Attendee',
    headline: 'Software engineer (demo persona)',
    isUser: true,
    optedIn: true,
  });
  const top = <T extends { count: number }>(m: Map<string, T>, n: number) =>
    [...m.values()].sort((a, b2) => b2.count - a.count).slice(0, n);
  for (const t of top(topicUse, 3)) b.edge('INTERESTED_IN', me, b.node(t.node));
  for (const s of top(skillUse, 3)) b.edge('SKILLED_IN', me, b.node(s.node));
  for (const [g, name] of GOALS.filter(([g]) => g === 'networking' || g === 'learn')) {
    b.edge('HAS_GOAL', me, b.node(goalNode(g, name)));
  }
  b.edge('TARGETS', me, b.node(CONFERENCE), { at: Date.parse('2026-10-24T12:00:00Z') });
  // Ex-colleague signal: a real company with 2+ speakers, other than the host.
  const shared = [...companySpeakers.entries()]
    .filter(([cid, ids]) => ids.size >= 2 && cid !== 'company:github')
    .sort((a, b2) => b2[1].size - a[1].size)[0];
  if (shared) b.edge('WORKED_AT', me, b.node(companies.get(shared[0])!), { from: '2019', to: '2023' });
  return b;
}

// ---------- main ----------
const raw = {
  sessions: await readLatestRaw<{ sessions: RfSession[] }>('sessions'),
  speakers: await readLatestRaw<{ records: LiProfile[] }>('speakers'),
  pastTalks: await readLatestRaw<{ matches?: { speaker: string; video: YtVideo }[] }>('past-talks'),
  jobs: await readLatestRaw<{ records: Job[] }>('jobs'),
  sideEvents: await readLatestRaw<{ events: SideEventRaw[] }>('side-events'),
};
if (!raw.sessions) throw new Error('normalise: no data/raw/sessions-*.json');

const results: Record<string, Awaited<ReturnType<SnapshotBuilder['write']>>> = {};
const conference = new SnapshotBuilder('conference');
conference.node(CONFERENCE);
for (const [g, name] of GOALS) conference.node(goalNode(g, name));
results.conference = await conference.write();

const sessions = buildSessions(raw.sessions.sessions);
results.sessions = await sessions.builder.write();
const talksById = new Map([...sessions.talks.values()].map((t) => [t.id as string, t]));
const companies = new Map(
  [...sessions.builder.nodes.values()].filter((n) => n.label === 'Company').map((n) => [n.id, n as Record<string, unknown>]),
);

if (raw.speakers) results.speakers = await buildSpeakers(raw.speakers.records, sessions.speakers).write();
if (raw.pastTalks?.matches) {
  const past = await buildPastTalks(raw.pastTalks.matches, sessions.speakers, talksById);
  results['past-talks'] = await past.builder.write();
}
const jobs = buildJobs(raw.jobs?.records ?? []);
if (raw.jobs) results.jobs = await jobs.builder.write();
if (raw.sideEvents) {
  const handles = new Set([...sessions.speakers.values()].map((s) => s.node.handle as string));
  results['side-events'] = await buildSideEvents(raw.sideEvents.events, handles).write();
}
results.demo = await buildDemo(sessions.topicUse, jobs.skillUse, sessions.companySpeakers, companies).write();

for (const [name, r] of Object.entries(results)) {
  console.log(`${name.padEnd(12)} nodes=${r.nodes} edges=${r.edges} skipped=${r.skipped}`);
}
