# Hallway: Build Plan v2 (docs/PLAN.md)

Oct 24, 2026 · revised 13:50 after the product pivot · @Ron

Spec and runbook for the coding agents building Hallway today. One human reviews plans, merges PRs and makes cut decisions; three Claude Code sessions build. `CLAUDE.md` points every session here. **This v2 replaces v1 entirely**; anything not written here is out of scope.

## 1. The product

**Hallway** is a mobile-first PWA (Next.js) that plans your conference around who you are. You open it to a chat. It asks which conference you're targeting and what you want out of it (networking, learning a topic, jobs, hiring, fundraising...). It reads your LinkedIn and GitHub, or lets you describe yourself. Then it builds you a plan across four tabs: your feed and calendar, people to meet (swipe cards), side events to explore, and an agenda that remembers everything you've done.

Every recommendation is backed by a walk through one FalkorDB graph, and the app shows that walk as proof. A PWA because judges scan a QR code and try it on their own phones in seconds; native iOS is not possible in a day.

## 2. Product structure

### 2.1 Onboarding: a chat (the home screen)

A full-screen chat. **The onboarding flow is a deterministic step machine on the server** (`/api/chat`: conference → goals → identity → confirm), so it works even if the agent is down. The LLM (`gpt-5-mini`) is used only to understand free-text answers and to extract profiles. Quick-reply chips for every question, so nobody has to type on stage.

1. **"Which conference are you focusing on?"** Chips: GitHub Universe 2026 (pre-ingested), plus free text. A conference we don't have triggers a **live ingest** (section 7.3). The chat streams its progress ("Found 84 sessions… 31 speakers… 18 side events…") and keeps asking questions meanwhile.
2. **"What do you want out of it?"** Multi-select goal chips (Networking, Learn a topic, Find a job, Hire, Find collaborators, Fundraise), **or their own words**. Free text goes through **one fixed classification prompt** (`gpt-5-mini`, never rewritten per user): it returns `Intent {goals, topics, summary}` as JSON, with topics restricted to names that exist in the graph for this conference. The chat shows the parsed line ("Networking + Learn · AI, devtools") with **Edit**. Only the parsed result is stored, never the raw sentence.
3. **"Who are you?"** Any of:
   - LinkedIn profile URL, scraped live via Bright Data
   - LinkedIn PDF export upload, parsed by the LLM
   - GitHub username, via the REST API: repos, languages, dependencies
   - If none of these: "Tell me about yourself" in free text, which the LLM extracts into a profile
   - **Optional: connect Google Calendar** by pasting the calendar's *secret address in iCal format* (Google Calendar → Settings → your calendar → Integrate calendar). We read busy blocks for the conference days into My Feed's calendar, the clash checks and the free-slot suggestions. Read-only, no OAuth: OAuth needs a fixed redirect URL, which the changing tunnel URL can't provide.
4. The agent shows a **profile summary card** (role, skills, topics, goals) with Edit and Looks good. Confirming writes the profile to the graph and moves to the main app.

"Use demo profile" skips everything on stage. A floating **chat button** on every tab opens the **Hallway agent** (TrueForge + OpenAI, tools in 5.2) for open questions ("find me more Go people", "what clashes tomorrow?").

### 2.2 Main app: four tabs

| Tab | What it shows | Priority |
| --- | --- | --- |
| **My Feed** | The top is **my calendar**: a day-strip timeline of everything confirmed (added sessions and side events; accepted meetings), with clash markers. Below it, **detailed cards** for each confirmed item, then a **"Requests sent"** section (people you right-swiped, with invite status pending, accepted or declined; query 8), then **suggested next items** (the top 3 not yet acted on from queries 1, 2 and 4). | Must |
| **People** | **Swipe deck**, Tinder style. Each card shows a person, **category tags** (e.g. "Shared stack", "Speaker", "Hiring", "Same topic", "Ex-colleague network"), the reason with its graph path, and where they'll be. Right swipe: an invite sheet. Left swipe: pass. **The deck re-ranks from your choices** (section 6.3). A filter row of tag chips. | Must |
| **Explore** | Luma and sponsor side events around the conference (parties, meetups, breakfasts), ranked for you. Each has Add to calendar, with a clash warning. Not in the scripted demo. | Should |
| **Agenda** | Two panes you **swipe between**. **Now:** the target conference's talks, presentations, workshops and keynotes in suggested priority order, each with **+** to add to the calendar, a **clash warning** if it overlaps, and a **Rerun** tag when the speaker gave it before. **Past:** your FalkorDB graph (`@falkordb/canvas`) of everything you've done in Hallway, across visits and conferences: conferences targeted, sessions added, people swiped and met, invites accepted. Tap a node for details. | Must |

### 2.3 Invites: right swipe → request → accept → calendar

1. A right swipe opens an **invite sheet** (prefilled from `GET /api/invites/suggest`) with:
   - **up to 3 suggested slots:** free 30-minute gaps during conference hours (09:00–18:00 venue time, from `Conference.tz`) that overlap neither your calendar (query 5, including imported Google Calendar blocks) nor the person's own talks (`SPEAKS_AT`). Computed with `freeSlots` from `packages/graph`
   - a place: the venue lobby or near their session
   - an editable intro note
2. **Send request** creates a `Meeting` (status `pending`) and a short **invite link** (`PUBLIC_URL/invite/<token>`). The sheet shows **Copy link**, **Share** (the Web Share API, so it opens LinkedIn, Messages or email) and **Open LinkedIn**. Hallway never sends anything by itself.
3. The invitee opens the link on their phone. A public page shows who's asking and why, with the offered slots. **The invitee picks a slot and taps Accept**, or Decline. Accepting sets the meeting to `accepted` with the picked `start`/`end` (the WITH edge turns green in the Past graph). Only then does it appear in the requester's calendar. Both sides get an **Add to Google Calendar** link (a prefilled `calendar.google.com/calendar/render?action=TEMPLATE…` URL) and an `.ics` download.
4. After the meeting, **Mark as met** on its card writes a `MET` edge and sets the meeting status to `met`.
5. **Fallback (if the invite page slips):** a **Mark accepted** button on the request card in My Feed does the same state change.

On stage, a judge accepts from their own phone and the meeting appears in the calendar, and its edge turns green in the graph.

## 3. UI/UX

**Principles**

- **Verdict, reason, action.** Each card has one line of verdict, one line of why, and one button.
- **The path is the proof.** A "3 hops" chip on every recommendation opens a bottom sheet with the graph path animating in.
- **One thumb.** Bottom tab bar, actions in the lower half, chips instead of typing.
- **Calm visuals.** GitHub Primer, dark theme. Colour only carries meaning: green = confirmed or accepted, amber = pending or rerun, red = clash.
- **Never a blank screen.** Skeletons while loading. The agent streams its steps and the live ingest streams its counts. Every empty state says what to do next.
- **Human in the loop.** Nothing leaves the app without a confirmation sheet showing the exact text. Invites are links you send yourself.

**Routes:** `/` (chat onboarding; redirects to `/feed` once a profile exists), `/feed`, `/people`, `/explore`, `/agenda?pane=now|past`, `/invite/[token]` (public), `/stage` (desktop).

**Screens**

| Screen | Key elements | The finishing detail |
| --- | --- | --- |
| Chat onboarding | Messages, quick-reply chips, file upload (PDF), profile summary card | LinkedIn and GitHub data appear as they load ("Found 23 repos, top: TypeScript, Go") |
| My Feed | Day-strip calendar (hour rows, today and tomorrow toggle), confirmed cards, Requests sent | Clash markers in red on the strip; a pending request pulses amber |
| People deck | Stacked cards, drag to swipe, ✓ / ✕ buttons for accessibility, tag filter chips | "Learning from your picks" toast after 3 swipes; tags reorder |
| Invite sheet | Slot, place, note, Copy / Share / LinkedIn | Shows the exact message that will be shared |
| Invite page (public) | Requester card, reason, slot, Accept / Decline | Works without onboarding; minimal data shown |
| Explore | List of side events with host, time and topic chips | "Hosted by" shows the host and why they fit you |
| Agenda / Now | Sessions by priority, + button, kind label (Talk, Workshop, Keynote, Panel) | Clash warning inline when + would overlap |
| Agenda / Past | `@falkordb/canvas` graph, legend, node detail sheet | Newest nodes glow; filter by conference |
| Stage view (`/stage`, desktop) | Phone frame on the left, live graph on the right | Nodes light up as the agent walks them |

**Design system: GitHub Primer** (MIT). `@primer/react` v38 only, `@primer/primitives` dark tokens, `@primer/octicons-react`. No Tailwind, no shadcn. Verdict chips are `Label` variants (success, attention, danger). Sheets are Primer `Dialog` styled as bottom sheets. The tab bar and swipe deck are the only custom components, built with Primer tokens. Do **not** use GitHub logos, the Invertocat, Mona or the word "GitHub" in our branding. Naming the conference "GitHub Universe" as data is fine.

## 4. Memory

FalkorDB is the memory. Every user action is a graph write with a timestamp:
- targeting a conference
- adding a session or side event
- swiping
- requesting or accepting a meeting
- marking someone met

The Past pane renders that history, and it survives reloads and new conferences (a FalkorDB criterion). `pnpm seed` preserves runtime-written edges (section 6.4).

## 5. Architecture and stack

Everything runs on the presenting laptop. Only Next.js is exposed through the Cloudflare quick tunnel. TrueForge, FalkorDB and the MCP servers stay on localhost.

**Request flow:**
- The phone or stage view talks to Next.js API routes.
- Chat routes go to TrueForge (OpenAI), which calls MCP tools (hallway-tools and the FalkorDB MCP), which read and write FalkorDB.
- Feed, deck and agenda routes query FalkorDB directly through `packages/graph`.
- Ingest has two paths:
  - **offline:** Bright Data + GitHub → `data/clean/*.json` snapshots → `pnpm seed`
  - **live:** an `/api/conferences` ingest job → Bright Data → the same normalisers → upserted into FalkorDB

| Layer | Choice |
| --- | --- |
| App | Next.js 16 App Router PWA, React 19, Primer React v38 + Primitives + Octicons |
| Graph view | `@falkordb/canvas` web component |
| Agent | TrueForge local server (`npx @truefoundry/trueforge`, port 8790) via `@truefoundry/trueforge-sdk`, OpenAI models |
| Agent tools | `packages/mcp-hallway`: a streamable-HTTP MCP server with named, typed tools (section 5.2); FalkorDB MCP for read-only open questions |
| Database | FalkorDB in Docker via the `falkordb` npm client |
| Data in | Bright Data (Web Scraper API datasets + Web Unlocker), GitHub REST API, OpenAI for extraction and embeddings |
| Hosting | Laptop + Cloudflare quick tunnel. HTTPS for PWA install. The tunnel blocks SSE, so streaming routes use NDJSON over chunked fetch |

### 5.1 Verified facts and corrections (from the docs check, still valid)

- **TrueForge only registers remote MCP servers** (streamable HTTP or SSE, no stdio). `packages/mcp-hallway` runs as streamable HTTP on localhost. The FalkorDB MCP uses the `falkordb/mcpserver` Docker image (HTTP 8080, `FALKORDB_DEFAULT_READONLY=true`). Read-only is only a default that `query_graph` callers can override, so the agent registers it with `enableTools: ["query_graph_readonly", "list_graphs", "get_graph_schema", "get_node_schema", "get_relationship_schema"]` and never gets `query_graph` or `delete_graph`. Bright Data MCP, if used, is the hosted `https://mcp.brightdata.com/mcp`. [TrueForge](https://github.com/truefoundry/trueforge) · [FalkorDB MCP](https://github.com/FalkorDB/FalkorDB-MCPServer)
- **Tool approvals are API-only.** `apps/web/lib/agent/setup.ts` creates the agent with `requireApprovalForTools` naming tools literally (section 5.2) and writes its id to `TRUEFORGE_AGENT_ID`.
- **Models:** OpenAI is registered in TrueForge as `openai/gpt-5-2` (agent) and `openai/gpt-5-mini` (extraction, cheap calls). Model names are lowercase with hyphens only. Embeddings use `text-embedding-3-small` via the OpenAI API directly.
- **TrueForge → Next.js is SSE on localhost;** `/api/chat` re-emits it as NDJSON. The tunnel never carries SSE.
- **`@falkordb/canvas` (v0.3)** themes only through colours. It throws on import during SSR: load it in a `'use client'` component with a dynamic import in `useEffect`.
- **Primer React v38:** `BaseStyles` wrapper, `data-color-mode="dark" data-dark-theme="dark"` on `<html>`, Primitives functional dark theme CSS. Server components cannot pass component props (e.g. `leadingVisual={Icon}`) to Primer client components: mark such files `'use client'`.
- **FalkorDB:** data lives in `/var/lib/falkordb/data` (the compose volume mounts there). `RENAME` atomically replaces a graph. The image's default query timeout is 1000 ms, so keep queries indexed.
- **Versions:** Next 16.4, React 19.3, zod 4, vitest 5, TypeScript 6.0 (pinned: typescript-eslint needs <6.1), `falkordb` 6.9, pnpm 12.

### 5.2 Agent tools (`packages/mcp-hallway`)

Each tool returns its answer plus a `GraphPath` where one applies.

| Tool | Does | Approval |
| --- | --- | --- |
| `list_conferences` | Ingested conferences with status | — |
| `start_conference_ingest` | Starts a live ingest job for a named conference or URL; returns a job id | — |
| `get_ingest_status` | Counts and stage of a job | — |
| `ingest_profile` | From a LinkedIn URL, GitHub username, PDF text or free text; returns a draft profile | — |
| `save_profile` | Writes the confirmed profile, goals and target conference to the graph | — |
| `suggest_people` | Ranked candidates with tags and paths (section 6.3) | — |
| `plan_sessions` | Prioritised sessions with clash flags | — |
| `suggest_explore` | Ranked side events | — |
| `check_calendar` | Calendar for a day with clashes | — |
| `explain_path` | Human-readable proof for a recommendation | — |
| `add_to_calendar` | Adds a session or side event (PLANS edge) | **yes** |
| `create_invite` | Creates a pending Meeting and its invite link | **yes** |

### 5.3 API routes (zod-validated in and out; owning track in brackets, see section 8)

| Route | Purpose |
| --- | --- |
| `POST /api/chat` [Main] | Onboarding step machine, NDJSON `ChatEvent` stream. After onboarding, proxies to the TrueForge agent |
| `POST /api/chat/approve` [Main] | Approve or deny an agent tool call |
| `POST /api/profile/pdf` [Main] | LinkedIn PDF upload → text → draft profile |
| `POST /api/profile/calendar` [Main] | Connect Google Calendar via secret iCal URL → `CalendarBlock`s for the conference days |
| `POST /api/profile` [Main] | Save the confirmed profile, goals and conference; sets the identity cookie |
| `GET /api/feed` [A] | Calendar items, confirmed cards, requests sent, suggestions |
| `GET /api/people?tag=` [B] · `POST /api/people/swipe` [B] | Deck cards; swipe (writes SWIPED and PREFERS) |
| `GET /api/invites/suggest?personId=` [B] · `POST /api/invites` [B] · `GET/POST /api/invites/[token]` [B] | Create an invite; public view; accept or decline |
| `POST /api/meetings/[id]/accepted` · `/met` [B] (buttons live on A's feed cards) | Manual accept fallback; mark as met |
| `GET /api/agenda` [A] · `GET /api/explore` [B] · `POST /api/calendar` [Main] | Prioritised sessions; explore items; add to calendar (clash returned; shared by A and B) |
| `GET /api/past` [A] | The user's past subgraph for the canvas |
| `GET /api/stage/last-path` [A] | The latest path walked, polled by `/stage` |
| `GET /api/health` [Main] | Health |
| `POST /api/conferences` · `GET /api/conferences` · `GET /api/conferences/jobs/[id]` [Main] | Start a live ingest, list conferences, job status |

Tracks A and B build against these shapes from `packages/types` (PR B). Until PR B merges, they use local mocks shaped by this table.

## 6. Graph schema and queries

Every node has a stable string `id` (`<kind>:<key>`, no `|`). Edge ids are `${from}|${TYPE}|${to}`. Runtime writers set the same `id`. All Cypher lives in `packages/graph`, parameterised. Labels and types are interpolated only after zod enum validation.

```
(:Person {id, handle, name, role, headline, avatar, linkedin, github, about, optedIn, isUser})
(:Conference {id, name, start, end, city, venue, tz, url, source: 'snapshot'|'live', status})  // tz: IANA venue time zone
(:Talk {id, title, abstract, kind: 'talk'|'workshop'|'keynote'|'panel'|'other', start, end, room})
(:PastTalk {id, title, conf, year, url})
(:SideEvent {id, name, start, end, venue, url, source})       // Luma etc.
(:Company {id, name, funding, booth})  // booth: optional, unused by v2 UI   (:Repo {id, fullName, stars})   (:Package {id, name, ecosystem})
(:Skill {id, name})   (:Topic {id, name})   (:Goal {id, name})
(:Meeting {id, tokenHash, proposed: [iso…≤3], durationMinutes, start?, end?, place, note,
           status: 'pending'|'accepted'|'declined'|'met', createdAt, respondedAt})  // start/end = picked slot
(:CalendarBlock {id, start, end, title, source: 'gcal-ics'})       // imported busy time

(Talk)-[:PART_OF]->(Conference)        (SideEvent)-[:NEAR]->(Conference)
(Person)-[:SPEAKS_AT]->(Talk)          (Person)-[:GAVE]->(PastTalk)      (Talk)-[:SIMILAR_TO {score}]->(PastTalk)
(Person|Company)-[:HOSTS]->(SideEvent) (Person)-[:ATTENDING]->(SideEvent|Conference)
(Person)-[:WORKS_AT]->(Company)        (Person)-[:WORKED_AT {from?, to?}]->(Company)  // dates when known
(Person|Company)-[:OWNS]->(Repo)-[:DEPENDS_ON]->(Package)<-[:MAINTAINS]-(Person)
(Person)-[:SKILLED_IN]->(Skill)        (Company)-[:HIRING_FOR]->(Skill)
(Talk)-[:ABOUT]->(Topic)               (Person)-[:INTERESTED_IN]->(Topic)
(Person)-[:HAS_GOAL]->(Goal)           (Person)-[:TARGETS {at}]->(Conference)
(Person)-[:PLANS {at}]->(Talk|SideEvent)
(Person)-[:SWIPED {dir: 'right'|'left', at}]->(Person)
(Person)-[:PREFERS {weight}]->(Topic|Skill|Company|Goal)        // learned from swipes
(Person)-[:ORGANIZES]->(Meeting)-[:WITH]->(Person)
(Person)-[:MET {at, via}]->(Person)
(Person)-[:HAS_BLOCK]->(CalendarBlock)
```

### 6.1 Ingest-time facts

`SIMILAR_TO` scores are computed once (OpenAI embeddings of title + abstract, cosine, keep > 0.8). Talk `kind` and `end` come from the catalog. When the end is missing, the normaliser sets start + 45 min, or + 90 min for workshops.

### 6.2 Queries (each has a vitest test against `data/fixtures`, including its path)

1. **Candidates for the deck.** One query per signal, merged and scored in TS:
   - dependency route: `me→OWNS→Repo→DEPENDS_ON→Package←MAINTAINS←p`
   - shared topic: `me→INTERESTED_IN→Topic←ABOUT←Talk←SPEAKS_AT←p`
   - goal match: e.g. Find a job → `p→WORKS_AT→Company→HIRING_FOR→Skill←SKILLED_IN←me`
   - same company or ex-colleague: `me→WORKED_AT→Company←WORKS_AT|WORKED_AT←p`
   - speaker at a session I planned: `me→PLANS→Talk←SPEAKS_AT←p`

   "At the conference" means the person `SPEAKS_AT` a Talk `PART_OF` it, `HOSTS` a SideEvent `NEAR` it, or `ATTENDING` it (opted-in users). Candidates exclude the user, people already `SWIPED`, and people already `MET`. Each candidate carries its tags (one per signal) and its strongest path.
2. **Session priority:** Talks `PART_OF` the target conference, scored by topic match + goal boost + `PREFERS` weights, with a rerun flag (`SIMILAR_TO > 0.8` by the same speaker). Goal boosts are a fixed map in `packages/graph`:
   - Learn a topic → workshops, and talks about the user's topics
   - Networking → keynotes and panels
   - Find a job → talks whose speaker `WORKS_AT` a Company `HIRING_FOR` the user's skills
   - Hire / Find collaborators / Fundraise → talks about the user's topics by speakers at companies in their space
3. **Clash check:** an interval overlap of a candidate item against the user's `PLANS` items and accepted Meetings. Done in TS over one query's results.
4. **Explore:** `SideEvent -[:NEAR]-> Conference`, scored by `PREFERS`, topic and host fit.
5. **Calendar:** `PLANS` targets, `Meeting {status:'accepted'}` (organised or invited), and `HAS_BLOCK` busy blocks, ordered by start. Implemented once in `packages/graph/src/calendar.ts` (`getCalendar`, `findClashes`, `freeSlots`, `conferenceDays`, `itemEnd`).
6. **Past graph:** the user's subgraph. Every node within 2 hops via `TARGETS | PLANS | SWIPED | ORGANIZES | WITH | MET | HAS_GOAL | PREFERS`, capped at 200 nodes.
7. **Writes**, each a single parameterised `MERGE` that sets `id`:
   - **profile:** the user's Person (`isUser: true`), `SKILLED_IN`, `INTERESTED_IN`, `WORKS_AT`, `WORKED_AT`, `OWNS`/`DEPENDS_ON` for their repos
   - **activity:** `TARGETS`, `HAS_GOAL`, `PLANS`, `SWIPED`, `PREFERS` updates, `Meeting` create and accept, `MET`
8. **Requests sent:** the user's `ORGANIZES` Meetings with the `WITH` person and status, newest first.

### 6.3 Swipe learning (simple, explainable, graph-native)

A candidate's score is `Σ signalWeight × (1 + PREFERS(me, feature))` over their features. With no `PREFERS` edges yet, every signal counts equally.
- A **right swipe** adds +0.2 to the `PREFERS` weight of each of the candidate's features: their topics, skills, company and the goal that matched.
- A **left swipe** adds −0.1.

Weights are clamped to [−1, 2]. The deck refetches after each swipe. Because the weights are edges, the Past graph and the path sheet can show *why* the ranking changed.

### 6.4 Seed and runtime writes

`pnpm seed` merges every `data/clean/*.json` plus `data/live/*.json` (falling back to `data/fixtures` when `data/clean` is empty), builds `<graph>_next`, carries over the user's runtime subgraph, then `RENAME`s it into place.

**The user's runtime subgraph** is every `isUser` Person, every edge out of them (profile and activity, from 6.2 #7), the nodes those edges reach that the snapshot lacks (their Repos, Packages, Companies, Skills, Topics, Goals, Meetings), and `Meeting -[:WITH]->` edges.

Live-ingested conferences are written to gitignored `data/live/<conf>.json` (with their Conference node, `source: 'live'`), so a reseed keeps them without dirtying committed folders.

**Writing from other packages:** `packages/graph` exports `upsertSnapshot(snapshot)`, which merges nodes and edges by id without wiping. `packages/ingest` calls only that, so all Cypher stays in `packages/graph`.

**Privacy rule:** the graph only holds:
- people public in this context (speakers, hosts, package maintainers, public sponsor staff)
- users who onboard themselves

The invite page shows only the requester's name, headline, reason and slot.

**Public-tunnel rules:**
- **Identity:** the server identifies the user by an httpOnly cookie set at onboarding (`DEMO_HANDLE` for the demo profile). Write routes never take "me" from the request body.
- **Invite tokens:** 128-bit random. Store only their hash. Accept and decline are idempotent, and a request can be answered once.
- **Rate limits:** credit-spending routes (`/api/chat`, live ingest, LinkedIn fetch) get a per-IP rate limit (`apps/web/lib/ratelimit.ts`, Main) and the global budget guard (section 7.4). Over the limit, they return cached results instead of errors.

## 7. Data

### 7.1 Sources

| Data | Source | How | Feeds |
| --- | --- | --- | --- |
| Universe sessions, speakers, times, kinds | `reg.githubuniverse.com` catalog | Bright Data Web Unlocker (`expect` element for the session list); Browser API only if Unlocker fails (ask first) | Agenda, deck |
| Speaker profiles | LinkedIn | Bright Data LinkedIn profiles dataset | Deck, tags |
| Speakers' past talks | YouTube | Bright Data YouTube videos dataset (discover by keyword) | Rerun tag |
| Sponsor hiring | LinkedIn jobs | Bright Data LinkedIn jobs dataset (discover by keyword + company) | "Hiring" tag, job-goal ranking |
| Side events | Luma city and calendar pages, sponsor event pages | Web Unlocker; public event data and hosts only (never guest lists) | Explore, feed |
| User's busy time | Google Calendar secret iCal address (pasted by the user) | `fetch` + `node-ical` (expands recurring events), conference days only | Calendar, clashes, free slots |
| User profile (`packages/ingest` exports `fetchLinkedInProfile`, `parseLinkedInPdf`, `fetchGitHubProfile`, `extractProfileFromText`; the profile routes and tools call them) | LinkedIn URL / PDF / GitHub / free text | LinkedIn dataset (live, by URL) · PDF text → `gpt-5-mini` extraction · GitHub REST API · free text → `gpt-5-mini` extraction | Profile, deck |

### 7.2 Offline snapshot (GitHub Universe 2026)

1. Raw → `data/raw/<source>-<ts>.json` (gitignored). A normaliser writes `data/clean/<source>.json` in the `GraphSnapshot` format (stable ids, null keys dropped, each record validated, bad ones skipped and logged).
2. Run every source on 3 records first and show the human the clean output. Each full run is capped at 200 records.
3. Commit `data/clean/` as soon as it is good. From then on the Universe demo never waits on a scraper.

### 7.3 Live ingest (any other conference)

1. `POST /api/conferences` with `{ name | url }` starts a job in the Next.js process (an in-memory queue, one job at a time). `GET /api/conferences/jobs/<id>` returns the stage and counts.
2. **Stages:**
   - **find:** web search via the Unlocker on a search URL, then pick the official site and agenda URL with `gpt-5-mini`
   - **sessions:** Unlocker on the agenda page, then `gpt-5-mini` extraction into Talk records
   - **speakers:** LinkedIn search by name and company, capped
   - **side events:** Luma search for the city and dates
3. Each stage writes through the same normalisers and upserts into FalkorDB as it finishes, so the app fills in progressively. Each stage has its own timeout and a stage failure is skipped, never fatal.
4. **Caps per live conference (lenient, about $5):**
   - 150 sessions
   - 80 speaker profiles
   - 30 side events
   - 3 past-talk searches per speaker for the first 30 speakers
5. Results are cached as `data/live/<conf>.json` (gitignored). A second request for the same conference is instant.

### 7.4 Budget

- **Budget:** $50 Bright Data, pay as you go. Scraper datasets are $1.50 per 1,000 records and the Unlocker is $1.50 per 1,000 requests.
- **Universe snapshot:** about 1,500 records, roughly $3.
- **Live conferences:** about $5 each at the caps.
- **Budget guard:** `packages/ingest` exports `budget.reserve(usd, label)` (throws past the limit) and `budget.status()`. It is a persisted counter in `data/live/budget.json` with limit `BRIGHTDATA_BUDGET_USD` (default 40). Every Bright Data call reserves first. Status shows in the chat.
- **Never buy anything** from the Dataset Marketplace, and never start collections from the dashboard.

## 8. Team, tracks and ownership

Two people, each with their own Claude Code, plus this main session. Ownership is **by feature, full stack**: each track owns its screens, API routes and graph queries, in separate files, so tracks rarely touch the same file.

| Track | Who | Where | Owns |
| --- | --- | --- | --- |
| **Main** | this Claude session (repo root, presenting laptop) | Rudraksh's laptop | **Shared core:** `packages/types` (the contract), `packages/graph/src/{client,seed,upsert,calendar}.ts` (schema, seed, `upsertSnapshot`, calendar query 5, clash check 3 and free-slot helper), `packages/mcp-hallway`, `packages/ingest` (Universe snapshot, profile fetchers, live pipeline, budget guard: run via worktree-isolated subagents), `data/` (all of it), app shell (`app/layout.tsx`, `providers.tsx`, `manifest.ts`, `globals.css`, icons, `app/page.tsx` chat onboarding, `components/shell/` tab bar + chat button), API `chat`, `profile`, `calendar`, `conferences`, `health`, `apps/web/lib` (agent, cache, ratelimit, identity cookie), `apps/web/package.json`, `scripts/`, `docs/`, root config |
| **A: Feed & My events** | teammate + their Claude Code | teammate's laptop (own clone) | `app/(app)/feed`, `app/(app)/agenda` (Now + Past panes), `app/stage`, `components/feed/`, `components/agenda/`, API `feed`, `agenda`, `past`, `stage`, `packages/graph/src/queries/{feed,agenda,past}.ts` (queries 2, 6, 8 and feed suggestions) + their tests |
| **B: Whom to meet & Explore** | Rudraksh + a Claude Code worktree session (`claude --worktree people`) | Rudraksh's laptop | `app/(app)/people`, `app/(app)/explore`, `app/invite`, `components/people/`, `components/explore/`, API `people`, `invites`, `meetings`, `explore`, `packages/graph/src/queries/{people,invites,explore}.ts` (query 1, swipe learning 6.3, Meeting writes, query 4) + their tests |

**Rules between tracks:**
- **Only Main edits `packages/types`.** A track that needs a type change asks Main (through its human). Main ships it as a small PR within minutes.
- **Shared helpers are Main's.** Calendar items, clash detection and free slots live in `packages/graph/src/calendar.ts`. A uses them for the feed calendar and agenda clashes; B uses them for invite slots and Explore clashes. `POST /api/calendar` is Main's and both tracks call it.
- **Cross-track UI:** the feed's "Requests sent" cards (A) render Meetings created by B, and call B's `meetings/[id]/accepted` and `/met` routes. Agree on the shapes in `packages/types` (`RequestSent`), not by reading each other's code.
- **Dependencies:** PR B adds every approved runtime dependency to `apps/web/package.json` (`@falkordb/canvas`, `@truefoundry/trueforge-sdk`, `@modelcontextprotocol/sdk`, `ics`, `pdf-parse`, `@hallway/graph`, `@hallway/ingest`), so tracks never edit the lockfile for them. A track that needs another dependency asks Main.
- `docs/QODO_CATCHES.md` is append-only and shared.
- **Pull `main` before starting each task;** contract PRs land often today.
- **Merging:** either human may merge a PR once Qodo's findings are fixed or answered and checks pass, but not a PR from their own track without a glance from the other human, when there's time.
- **The demo runs on Rudraksh's laptop.** Track A's work arrives by PRs merged to `main`.

### 8.0 Reconciling PR #5

PR #5 (merged before the track split) added a separate `frontend/` app, `backend/` type stubs, `docs/FEATURES.md` and `docs/DATABASE.md` from an earlier one-screen "Today" design. **Plan v2 is the single spec.** Its best ideas are folded in above: free-text goals through a fixed prompt (2.1), Google Calendar connect (2.1, via iCal), and the invitee picking the time (2.3). The sponsorship follow-up is dropped: we have no data on which companies sponsor. `FEATURES.md` and `DATABASE.md` are removed. **Track A's first PR ports `frontend/app/TodayFeed.tsx` and `today.module.css` into `apps/web/app/(app)/feed` against `FeedResponse`, then deletes `frontend/` and `backend/`.** Until then, lint ignores those folders.

### 8.1 Teammate setup (Track A, own laptop, about 15 minutes)

1. Accept the GitHub collaborator invite for `rudrakshchaudhry/Hallway`, then clone it.
2. Install Node 22.14+, pnpm, Docker Desktop, `gh` (`gh auth login`) and Claude Code.
3. `cp .env.example .env`. For Track A work, only `FALKORDB_URL`, `GRAPH_NAME` and `DEMO_HANDLE=demo` are needed, since fixtures cover feed and agenda. Get any API keys from Rudraksh via a password manager share, **never in chat or git**.
4. `pnpm install && docker compose up -d && pnpm seed && pnpm dev` → http://localhost:3000.
5. `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing`. Start `claude --permission-mode plan` in the repo and approve the `falkordb` and `playwright` MCP servers when asked.
6. Paste the Track A prompt from section 10.

## 9. Agent operating manual (Claude Code)

**Plan → build → verify → ship a small PR.**

- **Plan mode** for any change over 3 files or across packages.
- **Research subagents** read external docs before code depends on them.
- **Worktree-isolated subagents** for mechanical fan-out (MCP tool handlers, normalisers).
- The **reviewer** subagent reviews every diff.
- The **ui-verifier** checks UI at 390×844, and `/stage` at 1440×900, through the **Playwright MCP** in `.mcp.json` (`@playwright/mcp@0.0.83`, headless Chromium, 390×844 default viewport; use `browser_resize` for 1440×900). Browsers are installed on the laptop with `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing`. Screenshots land in the working directory and root-level `*.png` is gitignored.

**Git:**
- Never commit to `main`; it's protected.
- Branches are `feat/<area>-<slug>` or `fix/<slug>`. Keep PRs under about 300 hand-written lines, with a What / Why / How tested description.
- Ship with the `ship-pr` skill: verify, reviewer, PR, Qodo, then fix or answer every finding and log real catches. Don't merge; the human does.
- Never commit `.env`, `data/raw/`, or anything over 5 MB.

**Definition of done:**
- `pnpm typecheck && pnpm lint && pnpm test` pass, with FalkorDB running.
- Every route validates input and output with `packages/types` zod schemas.
- Every graph query has a fixture test including its path.
- UI is verified at 390 px with no console errors.
- No dependency outside the CLAUDE.md stack without asking the human. Already approved for v2: `pdf-parse` (LinkedIn PDF text), `ics` (calendar files) and `node-ical` (reading the user's Google Calendar iCal feed).

**Stop and ask when:**
- an external API differs from this doc (report with a link; don't switch libraries)
- a step needs a login, CAPTCHA, payment or new plan
- a scrape would exceed the caps in section 7
- a worktree session needs a `packages/types` change

## 10. Runbook (from 14:15)

| Time | Main (this session) | Track A: Feed & My events | Track B: Whom to meet & Explore | Humans |
| --- | --- | --- | --- | --- |
| 14:15–14:45 | **PR A** (this plan) → **PR B:** types v2, fixtures v2, `calendar.ts`, `upsertSnapshot`, seed carry-over, deps, scripts. In parallel, a worktree subagent starts the Universe scrape (3-record samples first) | Teammate setup (8.1); plan the feed and agenda on mocks shaped by 5.3 | Start `claude --worktree people`; plan the deck, invite sheet and Explore on mocks | Merge PR A, then PR B; collaborator invite |
| 14:45–16:15 | Onboarding step machine + chat UI; app shell + tab bar; profile fetchers; Universe snapshot committed by 15:15; then the TrueForge agent for the chat button; live ingest last (may slip) | Queries 2, 6, 8 + routes; My Feed calendar + cards + Requests sent; Agenda Now (+, clash) and Past (canvas) | Query 1 + swipe learning + routes; swipe deck + tags; invite sheet + invite page + accept; Explore | Review and merge PRs; phone-test through the tunnel |
| **15:15 gate** | Universe data seeded; chips-only onboarding → feed works on real data | Feed + Agenda Now render from real routes | Deck renders from real routes; a swipe re-ranks | Cut decision |
| 16:15–16:45 | **Integrate** on the presenting laptop: section 12 demo path in the browser and on a phone; `DEMO_CACHE=1`; `pnpm demo:check` | Last fixes; final PR merged by 16:30 | Last fixes; final PR merged by 16:30 | Merge order |
| 16:45–17:15 | **Polish only;** backup video at 17:00 | Help rehearse | Help rehearse | Record video; submit 17:15; rehearse |

**Track prompts** (paste into each track's Claude Code; the plan is the spec):
- **Track A:** "You are Track A (Feed & My events). Read docs/PLAN.md v2 sections 1–9, especially section 8, then your row in section 10. Stay inside Track A's files. Plan first, then ship small PRs with ship-pr."
- **Track B:** "You are Track B (Whom to meet & Explore). Read docs/PLAN.md v2 sections 1–9, especially section 8, then your row in section 10. Stay inside Track B's files. Plan first, then ship small PRs with ship-pr."

**DEMO_CACHE:** `DEMO_CACHE=record` saves responses for the scripted chat chips, the demo LinkedIn fetch and live-ingest stages to `data/cache/<key>.json`, keyed by chip id or URL. `DEMO_CACHE=1` replays them. Main owns the cache module.

**Phase prompts:** the human pastes a short prompt ("Phase v2, Session N. Read docs/PLAN.md v2 sections 1–9 and your row in section 10. Plan first, then ship small PRs with ship-pr."). The plan is the spec; prompts don't repeat it.

**Cut list, in this order, if a gate slips:**
1. stage view
2. jobs and hiring signals
3. rerun tag
4. LinkedIn PDF upload
5. Google Calendar connect
6. live ingest for other conferences (keep Universe; say "coming soon")
7. the public invite page (use **Mark accepted**)

**Dev server and worktrees:** Turbopack watches the whole repo, including `.claude/worktrees/`. While a worktree session or subagent is writing files, the main checkout's `next dev` recompiles and reloads pages. Close worktree sessions before integration and the demo.

**Never cut:** chat onboarding, My Feed calendar + cards, swipe deck with learning, Agenda Now with clash warnings, the Past graph, the Qodo PR history.

## 10.1 What was actually built (16:45)

- **One product, built by Main** after the tracks' PRs didn't land in time; the teammate's `dev` work (Google Calendar OAuth, day calendar, conference-link suggestions) is merged into My Feed, Agenda and Explore.
- **Google Calendar:** OAuth (read-only scope) instead of the iCal link; the encrypted session is bound to the Hallway person. Needs `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`; without them the Google parts hide. OAuth redirects work on localhost; on phones via the tunnel the redirect URI must match `PUBLIC_URL`.
- **Calendar:** add *and remove* (`POST`/`DELETE /api/calendar`); adding a side event with a registration page opens a "Register on Luma" sheet.
- **GitHub contribution heatmap** (GraphQL) in the onboarding profile card and on My Feed.
- **Not built (cut list):** stage view (stub route), TrueForge agent behind the chat button (the button reopens onboarding), LinkedIn URL/PDF onboarding, full live ingest (the Explore form covers single-page conference links).
- **Demo on the production build** (`pnpm --filter web build && pnpm --filter web start`): `next dev` reload-loops in browsers here because its watcher sees Next's own log writes.

## 11. Repo layout

```text
hallway/
  CLAUDE.md  .mcp.json  .worktreeinclude  .env.example  docker-compose.yml
  .claude/agents/           reviewer.md, ui-verifier.md
  .claude/skills/ship-pr/   SKILL.md
  docs/PLAN.md              this document
  docs/QODO_CATCHES.md      real Qodo findings fixed (for the demo)
  apps/web/                 Next.js PWA: app/(app) tabs, app/invite, app/stage, app/api, lib/agent
  packages/types/           zod contract (Main only)
  packages/graph/           client, seed, upsert, calendar (Main); queries/{feed,agenda,past} (A); queries/{people,invites,explore} (B)
  packages/mcp-hallway/     MCP server for the TrueForge agent
  packages/ingest/          Bright Data + GitHub + LinkedIn ingest, normalisers, live pipeline, budget guard
  data/fixtures/            hand-written test graph
  data/clean/               committed snapshots (+ live-<conf>.json)
  data/raw/                 gitignored
```

## 12. Demo path (3 minutes; what integration and `pnpm demo:check` must support)

| Time | On screen |
| --- | --- |
| 0:00–0:15 | Title, then the phone |
| 0:15–0:50 | Chat: tap "GitHub Universe 2026", pick goals (Networking, Learn AI tooling), paste a LinkedIn URL and GitHub username. Profile data streams in; confirm the profile card |
| 0:50–1:20 | My Feed: an empty calendar fills as suggested cards are confirmed. Agenda / Now: + a talk; a second + shows the **clash warning**; one talk tagged **Rerun** |
| 1:20–1:55 | People: swipe left twice, right once. The deck re-ranks ("Learning from your picks"). Tap the "3 hops" chip and the path animates in |
| 1:55–2:25 | The right swipe opens the invite sheet → Send → a judge scans the invite QR and taps **Accept** → the meeting appears in My Feed's calendar |
| 2:25–2:45 | Agenda / Past: the graph shows today's choices, including the new meeting edge. Optional: type a different conference in chat and its live ingest counts start streaming |
| 2:45–3:00 | Two Qodo catches, then the stack slide with the QR code |

With `DEMO_CACHE=1`, chat answers for the scripted chips and the LinkedIn fetch for the demo profile are served from cache. `pnpm demo:check` calls every section 5.3 route the demo uses and fails on errors, schema mismatches, or responses over 2 s (streams: time to first event).

`DEMO_HANDLE` names the Person handle "Use demo profile" loads: `demo` with fixtures; set it to the real persona once `data/clean` includes them.

## Sources

- [GitHub Universe 2026 guide (GitHub Blog)](https://github.blog/news-insights/company-news/your-guide-to-github-universe-2026-is-here-the-schedule-just-launched/)
- [TrueForge](https://github.com/truefoundry/trueforge) · [FalkorDB Canvas](https://docs.falkordb.com/browser/canvas) · [FalkorDB MCP Server](https://github.com/FalkorDB/FalkorDB-MCPServer)
- [Bright Data Scraper API](https://docs.brightdata.com/scraping-automation/web-data-apis/web-scraper-api/overview) · [Bright Data social media scrapers](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/overview.md)
- [Primer React](https://npmjs.com/package/@primer/react) · [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Google Calendar event template URL parameters](https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/main/services/google.md)
- [Claude Code docs: workflows, worktrees, subagents, MCP](https://code.claude.com/docs/en/common-workflows.md)
