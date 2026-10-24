# Hallway
Mobile-first PWA that plans a conference around you: a chat onboarding (target conference,
goals, LinkedIn/GitHub/self-description), then My Feed (calendar + confirmed cards), People
(swipe deck that learns, invite links), Explore (Luma and side events) and Agenda (Now:
sessions with clash warnings; Past: your FalkorDB memory graph). Every recommendation shows
its graph path. Full spec and runbook: @docs/PLAN.md (v2). Read sections 1–9 and your row in
section 10 before starting.

## Stack (do not substitute)
- Next.js App Router + TypeScript, pnpm workspaces, vitest
- UI: @primer/react v38, @primer/primitives dark theme tokens, @primer/octicons-react.
  No Tailwind, no shadcn, no other UI kit. No GitHub logos, Invertocat or Mona.
- Graph: FalkorDB in Docker via the `falkordb` npm client. Cypher lives only in packages/graph,
  always parameterised.
- Agent: TrueForge local server via @truefoundry/trueforge-sdk, OpenAI model, tools from
  packages/mcp-hallway. TrueForge stays on localhost; only Next.js is exposed.
- Graph view: @falkordb/canvas.

## Rules
- packages/types is the contract. Only the Main session edits it.
- Two humans work in feature tracks (Main, A: Feed & My events, B: Whom to meet & Explore).
  Stay inside your track's files (PLAN.md section 8); ask Main for type or shared-helper changes.
- API routes return data validated by their zod schema. Recommendations include a GraphPath.
- Scrapers never run in request handlers, except the live ingest job routes under
  /api/conferences and the onboarding LinkedIn fetch: both capped, time-limited, budget-guarded
  (PLAN.md 7.3–7.4), with cached fallback.
- Streaming routes (/api/chat, ingest progress) use NDJSON over a chunked fetch response, never
  SSE (the quick tunnel blocks SSE).
- "Me" always comes from the server-set cookie, never the request body. Invite tokens are random,
  stored hashed. Nothing leaves the app without a confirmation sheet.
- Secrets come only from process.env. Never print, log or commit them.
- Plan mode first for any change touching more than 3 files.
- Ship through the ship-pr skill. Never push to main. Never merge.
- Done = pnpm typecheck && pnpm lint && pnpm test pass, and UI verified at 390px.
- If reality contradicts PLAN.md, stop and tell me with a docs link.

## Commands
pnpm --filter web build && pnpm --filter web start (demo; next dev reload-loops in browsers here)
pnpm dev | pnpm seed | pnpm test | pnpm typecheck | pnpm lint | pnpm demo:check
docker compose up -d | pnpm ingest:check (Main adds it)
