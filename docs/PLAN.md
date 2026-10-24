# Hallway: Build Plan (docs/PLAN.md)

Oct 24, 2026 · @Ron

Spec and runbook for the coding agent building Hallway in one day: One human reviews plans, merges PRs and makes cut decisions; three Claude Code sessions build. This file lives in the repo as `docs/PLAN.md`, and `CLAUDE.md` (section 11) points every session at it.

## 1. The product: a mobile-first web app, not a native iOS app

We ship **Hallway** (working name, from "the hallway track"): a mobile-first Progressive Web App (PWA) built in Next.js, plus a wide "stage view" of the same app for the projector. Attendees use it on their phone at the venue; judges can scan a QR code on stage and try it on their own phones within seconds.

| Option | Build time risk | Judges can try it | Verdict |
| --- | --- | --- | --- |
| Mobile-first PWA (Next.js) | Low: one codebase, hot reload, served through a tunnel URL | Yes: scan a QR code, no install | **Pick this** |
| Native iOS (Swift / React Native) | High: Xcode signing, no App Store or TestFlight review in one day | Only on your own phone | Too slow for 6.5 hours |
| Desktop website only | Lowest | Yes | Wastes the in-person, at-the-venue angle |

Why this wins on polish: one codebase means every hour goes into UX instead of platform plumbing. A PWA can be added to the home screen, runs full-screen, and looks like a native app in the demo. Nothing in the four tracks needs native-only APIs.

## 2. Product structure: one feed, four tabs, one agent

The app answers one question from the moment you open it: **"What should I do next?"** Everything else is a drill-down. The four features are not four separate tools; they are four kinds of card in one ranked "Today" feed, each backed by the same graph.

| Tab | What it shows | Feature behind it | Priority |
| --- | --- | --- | --- |
| **Today** (home) | A ranked feed of next actions: "Meet Priya at the 6pm Git-Together", "Skip the 2pm talk, it's on YouTube", "Visit booth 124, they're hiring for Go" | All four | Must |
| **People** | Who to meet, each with the reason (graph path), an icebreaker, and where they'll be | Networking + dependency graph | Must |
| **Schedule** | Sessions marked Live-only / Rerun (watch later) / Clash | Rerun detector | Must |
| **Expo** | Booths ranked by fit: hiring for your skills, uses your stack, recently funded | Booth scout | Nice to have |
| **Ask** (floating button on every tab) | Chat with the TrueForge agent; every answer shows its graph path | Agent | Must |

Onboarding is three taps, under 30 seconds:

1. Enter your GitHub username (we read public repos and dependency files) or drop in a `package.json` / `requirements.txt`.
2. Pick up to 5 topics (pre-filled from your repos).
3. Done: Today feed loads. A "Use demo profile" link skips all of this on stage.

After the event, a **Follow-ups** screen (inside the People tab) lists everyone you marked as met, with drafted emails that wait for your approval before sending.

## 3. UI/UX: verdicts first, the graph as proof

Every screen leads with a verdict and lets the user tap for the reason. That one rule is what makes this feel like a product instead of a chatbot demo.

**Principles**

- **Verdict, reason, action.** Each card is one line of verdict ("Meet Priya"), one line of why ("maintains `zod`, which 4 of your repos use"), and one button ("Where is she?" / "Draft intro").
- **The path is the proof.** A small "3 hops" chip on every card opens a bottom sheet with the graph path animating in. This is the FalkorDB judging criterion turned into a UI pattern.
- **One-thumb use.** Bottom tab bar, primary actions in the lower half of the screen, nothing that needs typing except the Ask box. People use this standing in a hallway with a coffee.
- **Calm visual system.** GitHub's Primer design system (see below), dark theme by default (conference halls are dim, projectors love it), Primer's own accent and type scale. Colour only carries meaning: green = go live, amber = rerun, red = clash.
- **Never a blank screen.** Skeleton cards while loading; the agent streams its steps ("Searching graph… found 3 paths…") instead of a spinner; empty states say what to do next.
- **Human in the loop is visible.** Anything that leaves the app (an email, a calendar add) shows a confirmation sheet with the exact text. This is TrueForge's approval feature, made obvious on stage.

**Screen by screen**

| Screen | Key elements | The detail that makes it feel finished |
| --- | --- | --- |
| Onboarding | GitHub username field, topic chips, "Use demo profile" | Repos and deps appear as they load, so the wait feels like progress |
| Today | Ranked cards of mixed types, time-aware ("in 40 min") | Cards reorder as the day moves on; swipe to dismiss |
| Person sheet | Photo, role, why-meet path, icebreaker, where they'll be next | "Mark as met" button (section 4) |
| Session sheet | Live-only / Rerun verdict, link to the earlier recording, similarity % | "Watch later" saves it; "Add to calendar" asks first |
| Expo | Booth list sorted by fit, with booth numbers | Fit reasons as chips: "Hiring Go", "Uses your stack" |
| Ask | Chat with streamed tool steps and a path card under each answer | Suggested questions as chips so nobody types on stage |
| Follow-ups | People met today, drafted emails, approve / edit / skip | Approve sends; the card flips to "Sent" with a timestamp |
| Stage view (desktop) | Phone-frame app on the left, live FalkorDB graph on the right | Nodes light up as the agent walks them, so the audience sees the graph work |

**Design system decision: GitHub Primer, not shadcn.** At a GitHub event, an app that looks native to GitHub reads as polished instantly, and Primer is GitHub's open-source (MIT) design system. Primer React v38 styles components with CSS modules and Primer Primitives tokens, and it is tested with Next.js App Router and React 19. [Primer React](https://npmjs.com/package/@primer/react) · [Primer agent eval, Next.js App Router](https://primer.github.io/agent-eval/experiments/baseline/runs/2026-07-29)

| Need | Use | Notes |
| --- | --- | --- |
| Components | `@primer/react` v38 | Only UI kit in the app; no Tailwind, no shadcn |
| Colours, spacing, type | `@primer/primitives` dark theme CSS variables | Import the functional dark theme CSS once in the root layout; custom CSS modules use only these variables |
| Icons | `@primer/octicons-react` | Same icons GitHub uses |
| Graph view | `@falkordb/canvas` | Pass Primer token values into its theme config so it matches |
| Feed and lists | Primer `ActionList`, `Avatar`, `Label`, `Token` | Verdict chips as `Label` variants: success = live-only, attention = rerun, danger = clash |
| Schedule | Primer `Timeline` | Grouped by hour |
| Sheets and approvals | Primer `Dialog` styled as a bottom sheet on mobile | Approval sheet shows the exact email text |
| Status | Primer `Banner`, `Spinner` | Banner for "showing cached data" |

Where the look comes from: Primer components and tokens only, composed to follow GitHub mobile patterns. Do **not** copy GitHub screenshots or use GitHub's logos, Invertocat, Mona or the word "GitHub" in our branding; the code is MIT but the trademarks are not. The bottom tab bar is the one custom component (Primer has no mobile tab bar): build it with Primer tokens and Octicons.

## 4. Remembering who you met: a "Mark as met" button

Every Person sheet has a **Mark as met** button. It writes a `MET` edge with a timestamp, removes that person from "who to meet", and adds them to Follow-ups. This keeps the graph's memory across sessions (a FalkorDB criterion) with one API route and one Cypher `MERGE`, and no hardware.

## 5. Architecture and stack: TypeScript end to end, everything on one laptop

Run the whole system on the presenting laptop and expose only the Next.js app through a tunnel, so phones in the room can reach it. TrueForge's local mode has no login and is meant to stay on localhost, so the Next.js server talks to it privately. [TrueForge README](https://github.com/truefoundry/trueforge)

Flow: phone or stage view → Next.js API routes → TrueForge (OpenAI model) → MCP tools (hallway-tools, FalkorDB MCP, Bright Data MCP) → FalkorDB; Next.js also queries FalkorDB directly for feeds; offline ingest (Bright Data + GitHub → JSON snapshots → pnpm seed) loads FalkorDB. Phones only ever talk to the Next.js app; TrueForge, FalkorDB and the MCP servers stay private on the laptop, and the graph is loaded from snapshots before noon.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router) as a PWA, Primer React + Primer Primitives + Octicons | Polished defaults, one codebase for phone and stage view |
| Graph view | `@falkordb/canvas` web component | FalkorDB's own force-directed graph renderer, with themes and loading states built in [docs](https://docs.falkordb.com/browser/canvas) |
| Agent | TrueForge (`npx @truefoundry/trueforge`), called from Next.js via `@truefoundry/trueforge-sdk`; OpenAI model | Agent loop, MCP tools, approvals and streaming events handled for us; needs Node 22.14+ |
| Agent tools | A small custom MCP server ("hallway-tools") with named, typed tools; plus the official FalkorDB MCP server for open-ended Cypher | Named tools return reliable answers *and* the path; the LLM never has to invent Cypher for the core flows [FalkorDB MCP](https://github.com/FalkorDB/FalkorDB-MCPServer) |
| Database | FalkorDB in Docker, queried with the `falkordb` npm client | Required track; multi-hop Cypher |
| Data in | Bright Data Scraper APIs + Web Unlocker, GitHub REST API, saved as JSON snapshots | Fast, repeatable loads; demo never depends on live scraping |
| Hosting | Laptop + Cloudflare quick tunnel (no account; random trycloudflare.com URL that changes on each restart) | HTTPS is required for PWA install; no deploy risk. Quick tunnels don't support Server-Sent Events, so /api/ask streams NDJSON over a chunked fetch response instead |

The hallway-tools MCP server exposes about six tools: `people_to_meet`, `explain_path`, `check_rerun`, `rank_booths`, `record_meeting`, `draft_followup`. Each returns its answer plus the node and edge IDs it walked, which the UI animates. `draft_followup` (and any calendar add) is marked as requiring approval in TrueForge. The TrueForge sandbox runs on Daytona, so treat it as optional: use it only if setup takes under 20 minutes, for an "analyse my day" report.

## 6. Graph schema and the four queries that power the app

One graph, eight node types. Every feature is a different walk through it, which is exactly what the FalkorDB judges want to see.

```
(:Person {handle, name, role, avatar, linkedin, github, optedIn})
(:Company {name, funding, booth})
(:Repo {fullName, stars})        (:Package {name, ecosystem})
(:Talk {id, title, abstract, start, room})   (:PastTalk {title, conf, year, url})
(:SideEvent {name, start, venue, url})       (:Skill {name})   (:Topic {name})

(Person)-[:WORKS_AT]->(Company)        (Person)-[:OWNS]->(Repo)-[:DEPENDS_ON]->(Package)
(Person)-[:MAINTAINS]->(Package)       (Person)-[:SPEAKS_AT]->(Talk)
(Person)-[:GAVE]->(PastTalk)           (Talk)-[:SIMILAR_TO {score}]->(PastTalk)
(Person)-[:ATTENDING]->(SideEvent)     (Talk|Person)-[:ABOUT|INTERESTED_IN]->(Topic)
(Company)-[:HIRING_FOR]->(Skill)       (Person)-[:SKILLED_IN]->(Skill)
(Person)-[:MET {at, via}]->(Person)    (Person)-[:PLANS]->(Talk|SideEvent)
```

**1. Who to meet (dependency route, 4 hops)**

```cypher
MATCH path = (me:Person {handle: $me})-[:OWNS]->(:Repo)-[:DEPENDS_ON]->(pkg:Package)<-[:MAINTAINS]-(p:Person)
WHERE p <> me AND NOT (me)-[:MET]->(p)
OPTIONAL MATCH (p)-[:SPEAKS_AT|ATTENDING]->(where)
RETURN p, collect(DISTINCT pkg.name) AS sharedPkgs, collect(DISTINCT where) AS findThem, collect(path)[0] AS proof
ORDER BY size(sharedPkgs) DESC LIMIT 10
```

**2. Is this talk a rerun?**

```cypher
MATCH path = (s:Person)-[:SPEAKS_AT]->(t:Talk)-[r:SIMILAR_TO]->(old:PastTalk)<-[:GAVE]-(s)
WHERE r.score > 0.8
RETURN t.title, old.conf, old.year, old.url, r.score, path
```

**3. Which booths to visit**

```cypher
MATCH path = (me:Person {handle: $me})-[:SKILLED_IN]->(sk:Skill)<-[:HIRING_FOR]-(c:Company)
WHERE c.booth IS NOT NULL
RETURN c.name, c.booth, collect(sk.name) AS matches, collect(path) AS proof
ORDER BY size(matches) DESC
```

**4. Record a meeting (memory across sessions)**

```cypher
MATCH (a:Person {handle: $me}), (b:Person {handle: $them})
MERGE (a)-[m:MET]->(b)
ON CREATE SET m.at = timestamp(), m.via = 'button'
```

The `SIMILAR_TO` score is computed once during ingest (OpenAI embeddings of title + abstract, cosine similarity), not at query time, so the Schedule tab loads instantly.

**Privacy rule:** the graph only holds people who are public in this context (speakers, event hosts, package maintainers, sponsor staff on public pages) plus attendees who opt in through onboarding. Say this on stage; judges notice.

## 7. Data plan: real GitHub Universe 2026 data, scraped by noon, served from snapshots

Build for the real event: GitHub Universe 2026 runs Oct 28–29 at Fort Mason Center, San Francisco, with 6,000+ attendees and a public session catalog. Real speakers and real side events make the demo land far harder than fake data. [Cloudsmith session guide](https://cloudsmith.com/blog/10-github-universe-2026-sessions-not-to-miss)

| Data | Source | How we get it | Feeds |
| --- | --- | --- | --- |
| Sessions, speakers, abstracts, times | Universe session catalog (`reg.githubuniverse.com`, a JavaScript-heavy portal) | Bright Data Browser API or Scraper Studio | Schedule, rerun detector, people |
| Speakers' past talks | YouTube + other conference sites | Bright Data SERP API (search "\<speaker> talk"), then the YouTube videos scraper for titles, descriptions, dates | Rerun detector |
| Speaker / sponsor-staff profiles | LinkedIn profiles and companies | Bright Data LinkedIn scrapers (profiles, companies) | People, icebreakers |
| Sponsor hiring | LinkedIn jobs for each sponsor | Bright Data LinkedIn jobs scraper | Expo / booth scout |
| Company funding | Crunchbase | Bright Data Crunchbase scraper (confirm it's in your plan) | Expo |
| Side events and parties | Luma city/calendar pages (e.g. `luma.com/sf`) and sponsor event pages | Bright Data Web Unlocker; public event data only | Today feed, people (hosts) |
| Your deps, repos, maintainers | GitHub | GitHub REST API with a personal token (not scraping) | Dependency route to people |

Bright Data documents scrapers for LinkedIn (profiles, companies, jobs, posts) and YouTube (videos, channels, comments) in its scraper library. [Bright Data scrapers](https://docs.brightdata.com/scraping-automation/web-data-apis/web-scraper-api/overview) · [Social media scraper APIs](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/overview.md)

**Luma guest lists: don't.** Full Luma attendee lists generally need a logged-in, registered account, and anonymous visitors only see hosts and featured guests. Use only the public event details and hosts; attendees enter our graph by opting in. [example Luma scraper notes](https://apify.com/lukas_bekr/apify-luma-scraper)

**Snapshot strategy**

1. Every ingest script writes raw results to `data/raw/<source>-<timestamp>.json`, then a normaliser writes `data/clean/*.json`.
2. A loader script wipes and rebuilds the graph from `data/clean/` in under a minute (`pnpm seed`).
3. Commit the clean snapshots to the repo by 12:00. From then on the app never waits on a scraper.
4. One "Refresh side events" button triggers a live Bright Data call on stage. On failure or timeout (8 s), it shows the cached result with a "last updated" time. That is the failure-handling story for the Bright Data judges.
5. Scope the scrape to what the demo touches: about 100 sessions, their speakers, 15–20 sponsors, 20–30 side events. Check credit usage in the Bright Data dashboard after the first run so the $50 lasts the day.

## 8. Solo plan: three Claude Code sessions, four gates

The human is the product owner and reviewer; three Claude Code sessions are the team. Each session owns its own folders, so they never edit the same file. Session 1 runs in the main checkout; sessions 2 and 3 run in their own git worktrees.

| Session | Started with | Owns (folders) | Morning (to 12 PM) | Afternoon (to 3 PM) |
| --- | --- | --- | --- | --- |
| 1. Main | `claude` in the repo root | `packages/types`, `packages/graph`, `packages/mcp-hallway`, `apps/web/app/api`, `apps/web/lib/agent` | Scaffold, shared types, graph schema, seed, query 1 | MCP tools, TrueForge agent, `/api/ask` streaming, approvals |
| 2. Data | `claude --worktree data` | `packages/ingest`, `data/` | Bright Data + GitHub ingest, clean snapshots | Embeddings, rerun scores, booth data, live refresh endpoint |
| 3. UI | `claude --worktree ui` | `apps/web/app/(app)`, `apps/web/components`, `apps/web/styles` | Primer shell, tab bar, onboarding, Today feed on fixtures | Sheets, path view, Schedule, Ask UI, Mark as met, stage view |

After 3 PM only Session 1 stays open: it merges, integrates and polishes. Sessions 2 and 3 end once their last PR is merged.

Gates: **12 PM**, snapshots committed and one feature works end to end; **3 PM**, all must-have features work; **4 PM**, feature freeze (polish, bugs, backup video at 4:45); **5:15 PM**, submit and rehearse.

## 9. Agent operating manual (Claude Code)

One rule above all: **plan, then build, then verify, then ship a small PR.** The main session makes design and integration decisions; worktree sessions do well-specified work in parallel; subagents read docs and review diffs so the main context stays clean. Claude Code docs: [common workflows](https://code.claude.com/docs/en/common-workflows.md) · [worktrees](https://code.claude.com/docs/en/worktrees.md) · [subagents](https://code.claude.com/docs/en/sub-agents.md) · [MCP](https://code.claude.com/docs/en/mcp.md)

### 9.1 Which mode or mechanism, when

| Mechanism | How to start it | Use it in this project for | Do not use it for |
| --- | --- | --- | --- |
| Plan mode | `claude --permission-mode plan`, or `Shift+Tab` until the status bar shows plan mode | The start of every phase; the shared types; the graph schema; any change touching more than 3 files or more than one package | One-file fixes and copy changes |
| Higher effort / extended thinking | Raise the effort level in the session | Phase 0 planning, ranking logic in query 1, the agent's tool design, debugging a failure that survived one fix | UI boilerplate, CSS tweaks |
| Research subagent ("deep search") | "Use a subagent to read the current docs for X and report the API in 15 lines with links" | Reading TrueForge SDK, FalkorDB client, Primer v38, Bright Data API docs before code that depends on them | Writing code |
| Parallel sessions in worktrees | `claude --worktree data`, `claude --worktree ui` in new terminals | Sessions 2 and 3 (section 8) | Anything that edits `packages/types` or root config |
| Subagents with `isolation: worktree` | "Use worktree-isolated subagents, one per file" | Fan-out of mechanical, independent files: the six MCP tool handlers; the four Bright Data normalisers | Anything needing a design choice |
| Reviewer subagent | `.claude/agents/reviewer.md` (section 11), invoked by the ship-pr skill | A fresh-eyes review of every diff before its PR | Replacing Qodo |
| UI verifier subagent | `.claude/agents/ui-verifier.md` | Screenshots at 390×844 and 1440×900, console errors, comparison with section 3 | Changing code |
| Agent teams | Off | Not used: experimental, heavy on tokens, and three fixed sessions with fixed folders already cover it | — |
| Web search in the session | Ask the agent to check current docs | When an installed package's API differs from this doc | General browsing |
| Browser tool (Claude in Chrome or a Playwright MCP) | Ask it to open `http://localhost:3000` | Clicking through the demo path, screenshots, console logs | Real third-party sites |

### 9.2 MCP servers for the coding agent (development time)

These help the agent while building. They are separate from the app's runtime MCP servers in section 5. Add them with project scope so all three sessions share them through `.mcp.json`.

| Server | Why the agent needs it | Add it |
| --- | --- | --- |
| FalkorDB MCP | Inspect the live graph and test Cypher before putting it in code | Run the `falkordb/mcpserver` container from `docker-compose.yml`, then `claude mcp add --scope project --transport http falkordb <URL printed in its logs>` |
| Bright Data MCP | Look at real scrape output while writing normalisers (Session 2 only) | Follow Bright Data's MCP setup docs; add with `--scope project` |
| Browser (Claude in Chrome, or a Playwright MCP) | UI verification by Session 3 and the ui-verifier subagent | Enable the Chrome extension, or `claude mcp add` a Playwright server |
| GitHub | Not needed as MCP: use the `gh` CLI for PRs and reading Qodo comments | `gh auth login` (done by the human) |

### 9.3 Git, PRs and Qodo

- Never commit to `main`. One branch per task: `feat/p<phase>-<slug>` or `fix/<slug>`.
- Keep PRs under about 300 changed lines, one concern each. Description: **What**, **Why**, **How tested**.
- Ship with the `ship-pr` skill (section 11): verify, run the reviewer subagent, open the PR with `gh pr create`, wait for Qodo, fix or answer each finding, log real catches in `docs/QODO_CATCHES.md`, then hand back for the human to merge.
- Never commit `.env`, `data/raw/`, or anything over 5 MB. Commit `data/clean/` snapshots.
- Before starting a task in a worktree session, pull the latest `main` so shared types are current.

### 9.4 Definition of done (every task)

- `pnpm typecheck && pnpm lint && pnpm test` pass.
- Every API route validates its response with the zod schema from `packages/types`.
- Every graph query has a vitest test against the fixture graph (`data/fixtures/`), including the path it returns.
- UI work is checked by the ui-verifier subagent at phone width with no console errors.
- No new dependency outside the stack in `CLAUDE.md` without asking the human first.

### 9.5 When the agent should stop and ask

- An external API or package behaves differently from this doc: report what changed with the docs link; do not switch libraries.
- A step needs a login, a CAPTCHA, a payment, or a new paid plan.
- A scrape would exceed about 200 records or the credit alert.
- A plan would edit `packages/types` from a worktree session.

## 10. Runbook: phases, prompts, gates

The human starts each phase by pasting its prompt below into the named session. Every phase starts in plan mode; the human approves a plan only when it names files, tests and the PRs it will open.

### Phase 0: Scaffold and contracts (9:45–10:15, Session 1 only)

**Mode:** plan mode, higher effort. **Parallel:** one research subagent. **MCP:** none yet.

```text
Read docs/PLAN.md sections 1–11 and CLAUDE.md.

First, use a research subagent to read the current official docs for:
@truefoundry/trueforge-sdk (sessions, turns, streamed events, tool approvals),
the falkordb npm client, @falkordb/canvas, @primer/react v38 with Next.js App Router,
and the Bright Data Web Scraper API request pattern. Report each API in at most
15 lines with links. Flag anything that contradicts PLAN.md.

Then plan, without writing feature code:
1. The pnpm monorepo in section 11 (apps/web, packages/types, graph, mcp-hallway, ingest).
2. docker-compose.yml with falkordb and falkordb/mcpserver, with health checks.
3. packages/types: zod schemas + TS types for every node and edge in section 6, and for
   API payloads: FeedCard, PersonCard, SessionVerdict, BoothFit, GraphPath
   (nodeIds, edgeIds, human-readable hops), AskEvent (stream events).
4. A hand-written fixture graph in data/fixtures (about 30 nodes) that exercises all
   four queries, so UI and tests never wait on scraping.
5. apps/web: Primer v38 root layout with the dark theme, a hello page, PWA manifest.
6. Root scripts: dev, seed, test, typecheck, lint, demo:check.
List the PRs you will open.
```

**Done when:** `docker compose up -d` is healthy, `pnpm seed` loads the fixtures, `pnpm dev` shows a Primer-themed page, types compile. **PRs:** `chore: scaffold`, `feat: shared types + fixtures`. Then merge, and start sessions 2 and 3.

### Phase 1: Three sessions in parallel (10:15–12:00)

**Session 1, main, plan mode:**

```text
Phase 1, Session 1. Build packages/graph: connection, indexes, `pnpm seed` from
data/clean if present else data/fixtures, and query 1 (who to meet via dependencies)
exactly as section 6, returning PersonCard[] each with a GraphPath. Add vitest tests
against the fixture graph. Then add GET /api/feed and GET /api/people in apps/web
returning zod-validated data. Use the FalkorDB MCP to try each Cypher query on the
live graph before writing it into code. Ship with the ship-pr skill.
```

**Session 2, `claude --worktree data`, plan mode:**

```text
Phase 1, Session 2. You own packages/ingest and data/ only. Read PLAN.md section 7.
Build one script per source: Universe sessions (Bright Data Browser API or Scraper
Studio), speakers' LinkedIn profiles and companies, sponsor LinkedIn jobs, side events
(Web Unlocker on public pages), GitHub repos/deps/maintainers (REST API with
GITHUB_TOKEN). Each writes data/raw/<source>-<timestamp>.json; a normaliser writes
data/clean/*.json validated by packages/types.
Credits rule: run each source on 3 records first and show me the clean output before
any full run; cap each full run at 200 records. Retry once, then log and skip.
Ship each source as its own small PR with the ship-pr skill.
```

**Session 3, `claude --worktree ui`, plan mode:**

```text
Phase 1, Session 3. You own apps/web/app/(app), apps/web/components, apps/web/styles.
Read PLAN.md sections 2 and 3. Using only @primer/react v38, Primer Primitives dark
tokens and Octicons, build: the bottom tab bar (Today, People, Schedule, Expo) with a
floating Ask button, onboarding (GitHub username, topic tokens, 'Use demo profile'),
and the Today feed of FeedCards with skeleton loading, empty and error states.
Read data from /api/feed; until it exists, use a local mock that returns
data/fixtures shaped by packages/types. Check every screen with the ui-verifier
subagent at 390x844. Ship with the ship-pr skill.
```

**12 PM gate:** clean snapshots committed and seeded; query 1 returns real people with paths; the Today feed renders real cards. If data is late, keep building on fixtures and swap at 1 PM.

### Phase 2: Features (12:00–15:00)

**Session 1:**

```text
Phase 2, Session 1. (a) Queries 2–4 from section 6 with tests and their API routes
(/api/schedule, /api/booths, POST /api/met/[handle]). (b) packages/mcp-hallway:
an MCP server exposing people_to_meet, explain_path, check_rerun, rank_booths,
record_meeting, draft_followup; each returns its answer plus a GraphPath. Write the six
tool handlers with worktree-isolated subagents, one file each, then review and merge them
yourself. (c) Configure a TrueForge agent on an OpenAI model with hallway-tools
(and the FalkorDB MCP read-only); draft_followup requires approval. (d) POST /api/ask
streams TrueForge events to the client as AskEvent via the SDK, as NDJSON over a
chunked fetch response (not SSE: the Cloudflare quick tunnel does not support SSE).
Plan first.
```

**Session 2:**

```text
Phase 2, Session 2. (a) Embeddings of talk title+abstract (OpenAI) and SIMILAR_TO
edges with score > 0.8 into data/clean. (b) Sponsor hiring and funding into data/clean
for booth fit. (c) GET /api/refresh-events: live Bright Data call with an 8 s timeout;
on failure return the snapshot with lastUpdated. (d) A 'pnpm ingest:check' that reports
record counts and nulls per source. Ship each as a small PR.
```

**Session 3:**

```text
Phase 2, Session 3. Build: the Person and Session sheets; the path sheet rendering a
GraphPath with @falkordb/canvas themed from Primer tokens, animating hops in order;
the Schedule tab (Primer Timeline, Live-only / Rerun / Clash labels); the Ask tab
consuming the /api/ask stream with tool steps shown live and suggested-question tokens;
the approval sheet for draft_followup; a 'Mark as met' button on the Person sheet (POST
/api/met/[handle], then update the graph and Follow-ups live); and /stage, a 1440px view with the
phone UI on the left and a live graph on the right. Verify with ui-verifier.
```

**3 PM gate:** every must-have works end to end on real data: Today, People with path, Schedule reruns, Ask with streaming tools, Mark as met.

### Phase 3: Integrate (15:00–16:00, Session 1 only)

```text
Phase 3. Merge all open work. Run the full demo path from section 12 in the browser
tool and fix every break, then repeat it on a real phone through PUBLIC_URL. Add DEMO_CACHE=1: cached answers for the three suggested
questions and the booth query. Write `pnpm demo:check` that calls every route the
demo uses and fails if any takes over 2 s or fails schema validation.
```

### Phase 4: Polish only (16:00–17:15)

```text
Phase 4: feature freeze. Run the ui-verifier subagent on every screen at 390x844 and on
/stage at 1440x900. Produce a numbered polish list (spacing, copy, empty/loading/error
states, contrast, tap targets, animation timing), then fix it top to bottom in small PRs.
No new features, no new dependencies.
```

**Cut list, in this order, if a gate slips:** 1) Expo tab, 2) Bright Data live refresh inside the agent (keep the refresh button), 3) stage view (mirror the phone instead). **Never cut:** Today feed, the path sheet, Ask with streamed tool steps, the Qodo PR history.

## 11. Repo files (committed by the human at 9:00)

**Repo layout**

```text
hallway/
  CLAUDE.md                 agent rules
  .mcp.json                 dev-time MCP servers (written by `claude mcp add --scope project`)
  .worktreeinclude          copies .env into worktree sessions
  .claude/agents/           reviewer.md, ui-verifier.md
  .claude/skills/ship-pr/   SKILL.md
  docs/PLAN.md              this document, exported as Markdown
  docs/QODO_CATCHES.md      log of real Qodo findings fixed (for the demo)
  docker-compose.yml        falkordb + falkordb/mcpserver
  apps/web/                 Next.js PWA, API routes, /stage
  packages/types/           zod schemas + types: the contract (Session 1 only)
  packages/graph/           FalkorDB client, schema, seed, queries, tests
  packages/mcp-hallway/     MCP server for the TrueForge agent
  packages/ingest/          Bright Data + GitHub ingest, normalisers, embeddings
  data/fixtures/            hand-written test graph
  data/clean/               committed snapshots
  data/raw/                 gitignored
```

The committed files themselves (`CLAUDE.md`, `.env.example`, `.worktreeinclude`, `.claude/agents/*.md`, `.claude/skills/ship-pr/SKILL.md`) are the source of truth for their contents.

## 12. Demo path (what Phase 3 and demo:check must support)

The 3-minute demo follows one user through one morning at GitHub Universe. Every step below must work on real data, on a phone through PUBLIC\_URL and on /stage, and be covered by pnpm demo:check. With DEMO\_CACHE=1, the suggested-question chips must return cached answers; /api/refresh-events must fall back to the snapshot with lastUpdated.

| Time | On screen |
| --- | --- |
| 0:00–0:20 | Title slide, then the phone |
| 0:20–0:45 | Onboarding with the demo profile: GitHub repos and deps load live |
| 0:45–1:25 | Today feed → tap "Meet Priya" → path animates in stage view |
| 1:25–1:55 | Schedule tab → a talk marked Rerun → open the earlier recording |
| 1:55–2:20 | Ask: "Which booths should I visit?" (suggested chip) → streamed tool steps → ranked booths |
| 2:20–2:45 | Tap "Mark as met" on Priya's card → edge appears live in the stage graph → follow-up email drafted, approval sheet shown |
| 2:45–3:00 | Two Qodo catches, then the stack slide with the QR code so judges can try it |

(Names like "Priya" are placeholders; use a real public speaker from the scraped data.)

## Sources

- [Your guide to GitHub Universe 2026 (GitHub Blog)](https://github.blog/news-insights/company-news/your-guide-to-github-universe-2026-is-here-the-schedule-just-launched/)
- [10 GitHub Universe 2026 sessions not to miss (Cloudsmith)](https://cloudsmith.com/blog/10-github-universe-2026-sessions-not-to-miss)
- [TrueForge repository and README](https://github.com/truefoundry/trueforge)
- [FalkorDB Canvas](https://docs.falkordb.com/browser/canvas)
- [FalkorDB MCP Server](https://github.com/FalkorDB/FalkorDB-MCPServer)
- [Bright Data Scraper API overview](https://docs.brightdata.com/scraping-automation/web-data-apis/web-scraper-api/overview)
- [Bright Data social media scraper APIs](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/overview.md)
- [Luma scraper notes on guest-list visibility](https://apify.com/lukas_bekr/apify-luma-scraper)
- [Primer React on npm](https://npmjs.com/package/@primer/react)
- [Primer agent eval: Primer v38 in Next.js App Router](https://primer.github.io/agent-eval/experiments/baseline/runs/2026-07-29)
- [Claude Code: common workflows (plan mode, worktrees, subagents)](https://code.claude.com/docs/en/common-workflows.md)
- [Claude Code: worktrees and .worktreeinclude](https://code.claude.com/docs/en/worktrees.md)
- [Claude Code: subagents](https://code.claude.com/docs/en/sub-agents.md)
- [Claude Code: MCP](https://code.claude.com/docs/en/mcp.md)
- [Cloudflare Quick Tunnels (no account; no SSE; URL changes per run)](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
