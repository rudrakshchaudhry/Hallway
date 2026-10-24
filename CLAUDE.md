# Hallway
Mobile-first PWA that tells a GitHub Universe attendee what to do next: who to meet,
which talks are reruns, which booths fit them. Every recommendation shows its graph path.
Full spec and runbook: @docs/PLAN.md. Read sections 1–11 before starting any phase.

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
- packages/types is the contract. Only the main session edits it.
- Stay inside the folders your session owns (PLAN.md section 8).
- API routes return data validated by their zod schema. Recommendations include a GraphPath.
- Scrapers never run in request handlers, except /api/refresh-events (8 s timeout, cached fallback).
- /api/ask streams NDJSON over a chunked fetch response, never SSE (the quick tunnel blocks SSE).
- Secrets come only from process.env. Never print, log or commit them.
- Plan mode first for any change touching more than 3 files.
- Ship through the ship-pr skill. Never push to main. Never merge.
- Done = pnpm typecheck && pnpm lint && pnpm test pass, and UI verified at 390px.
- If reality contradicts PLAN.md, stop and tell me with a docs link.

## Commands
pnpm dev | pnpm seed | pnpm test | pnpm typecheck | pnpm lint | pnpm demo:check
docker compose up -d | pnpm ingest:check
