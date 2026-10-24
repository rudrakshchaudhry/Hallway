# Hallway

A mobile-first PWA that plans a conference around you. A chat asks which conference you're
targeting and what you want from it, reads your LinkedIn and GitHub (or lets you describe
yourself), then builds four tabs:
- **My Feed:** calendar and confirmed plans
- **People:** a swipe deck that learns, with invite links
- **Explore:** side events
- **Agenda:** sessions with clash warnings, plus your FalkorDB memory graph

**The spec and runbook are in [docs/PLAN.md](docs/PLAN.md).** Agent rules are in [CLAUDE.md](CLAUDE.md).

## Run it

```bash
pnpm install
docker compose up -d      # FalkorDB + FalkorDB MCP (localhost only)
pnpm seed                 # loads data/clean, or data/fixtures
pnpm dev                  # http://localhost:3000
pnpm tunnel               # optional: public HTTPS URL for phones
```

Checks: `pnpm typecheck && pnpm lint && pnpm test` (needs FalkorDB running) and `pnpm demo:check`.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js app: screens, API routes, agent glue |
| `packages/types` | zod contract shared by everything |
| `packages/graph` | FalkorDB client, seed, calendar helpers, per-track queries |
| `packages/ingest` | Bright Data, GitHub and LinkedIn ingest |
| `data/` | fixtures, committed snapshots, live caches |
| `frontend/`, `backend/` | legacy from PR #5, being ported into `apps/web` by Track A |
