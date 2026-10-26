# Hallway

Mobile-first conference planner: chat onboarding, then My Feed, People, Explore and Agenda tabs,
plus an agent behind the chat button. How it works: @docs/ARCHITECTURE.md. Setup: @README.md.

## Stack (do not substitute)
- Next.js App Router + TypeScript, pnpm workspaces, vitest, zod
- UI: @primer/react v38, @primer/primitives tokens, @primer/octicons-react, CSS modules.
  No Tailwind or other UI kits. No GitHub logos, Invertocat or Mona.
- Graph: FalkorDB via the `falkordb` client. Cypher lives only in packages/graph, always parameterised.
- Agent: TrueForge via @truefoundry/trueforge-sdk; tools served by apps/web/app/api/mcp.

## Rules
- packages/types is the contract: API routes validate input and output with its schemas.
  Recommendations include a GraphPath.
- "Me" comes only from the signed cookie (or the agent key in tools), never a request body.
- Streaming uses NDJSON over a chunked response, never SSE (the tunnel blocks it).
- Scrapers run only in the live-ingest job and the onboarding LinkedIn fetch: capped,
  time-limited, rate-limited and budget-guarded.
- Nothing leaves the app without a confirmation sheet. Invite tokens are random and stored hashed.
- Secrets come only from process.env. Never print, log or commit them.
- Use plan mode for changes touching more than 3 files.
- Ship through the ship-pr skill. Never push to main. Never merge.
- Done = pnpm typecheck && pnpm lint && pnpm test pass, and UI verified at 390px.

## Commands
pnpm --filter web build && pnpm --filter web start (browser testing; `next dev` reload-loops here)
pnpm dev | pnpm seed | pnpm test | pnpm typecheck | pnpm lint | pnpm demo:check | pnpm ingest:check
docker compose up -d
