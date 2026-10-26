# Hallway

**A conference plan built around you.** Hallway is a mobile-first PWA: tell its chat which
conference you're going to and what you want from it, let it read your LinkedIn or GitHub, and it
plans the event for you: who to meet, which sessions to catch, which side events fit, and when
you're free. Every recommendation is a walk through one FalkorDB graph, and the app shows that walk
as proof.

Built for the GitHub Universe 2026 hackathon. Universe is pre-ingested; any other conference can be
read live from its website.

## Features

- **Chat onboarding:** pick a conference (or type any other one and watch it being read live), choose goals with chips or your own words, then add a LinkedIn URL, a GitHub username, a few lines about yourself, or the demo profile.
- **My Feed:** a one-day calendar with a day switcher and clash markers, your confirmed plans, invites sent and suggestions.
- **People:** a swipe deck ranked by shared stack, topics, goals and history. It learns from your swipes. A right swipe sends an invite link, and the other person picks a slot.
- **Explore:** side events around the conference. Adding one points you to its Luma registration.
- **Agenda:** sessions in priority order with clash warnings, plus a **Past** graph of everything you've done in Hallway.
- **Ask Hallway:** an agent behind the chat button answers open questions with the same graph tools. It asks before it changes your calendar or creates an invite.

## Built with

| | |
| --- | --- |
| [FalkorDB](https://www.falkordb.com/) | The graph behind every recommendation, the user's memory, and the Past view (`@falkordb/canvas`) |
| [Bright Data](https://brightdata.com/) | Web Unlocker and Web Scraper API datasets: sessions, speakers, LinkedIn profiles, jobs, YouTube talks, Luma events, live ingest |
| [TrueFoundry TrueForge](https://github.com/truefoundry/trueforge) | Runs the Ask Hallway agent, calling Hallway's MCP tools, with per-tool approval |
| [OpenAI](https://openai.com/) | `gpt-5-2` for the agent; `gpt-5-mini` for extraction and classification; embeddings for rerun detection |
| [Qodo](https://www.qodo.ai/) | Reviewed every PR ([what it caught](docs/QODO_CATCHES.md)) |

Next.js 16 · React 19 · TypeScript · Primer React · zod · pnpm workspaces · vitest

## Getting started

Requires Node 22.14+, pnpm and Docker.

```bash
pnpm install
cp .env.example .env        # fill in keys; see the comments in the file
docker compose up -d        # FalkorDB on localhost
pnpm seed                   # loads data/clean (GitHub Universe 2026)
pnpm --filter web build && pnpm --filter web start   # http://localhost:3000
```

To try it on a phone, run `pnpm tunnel` and open the printed `trycloudflare.com` URL. Set
`PUBLIC_URL` to that URL so invite links point to it.

### Running the agent

Ask Hallway needs a local [TrueForge](https://github.com/truefoundry/trueforge) server with an OpenAI
provider that has the models `gpt-5-2` and `gpt-5-mini`. TrueForge blocks calls to localhost by
default, so allow it to reach the app:

```bash
OUTBOUND_URL_ALLOWED_HOSTS='["localhost","127.0.0.1"]' npx @truefoundry/trueforge@latest
```

Set `TRUEFORGE_URL` and `MCP_HALLWAY_TOKEN` in `.env`. The app registers its MCP server with TrueForge
on the first agent message. Everything else works without TrueForge.

## Development

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks (tests need FalkorDB running) |
| `pnpm seed` | Rebuild the graph from `data/`, keeping users' activity |
| `pnpm demo:check` | Smoke-test the API routes against a running app |
| `pnpm ingest:check` | Validate the committed snapshots |
| `pnpm --filter @hallway/ingest budget` | Show Bright Data spend against the budget |

```text
apps/web/            Next.js PWA: app/(app) tabs, app/api routes, lib (onboarding, agent, identity)
packages/types/      zod contract shared by everything
packages/graph/      FalkorDB client, seed, upserts, calendar and queries (all Cypher lives here)
packages/ingest/     Bright Data client, budget guard, normalisers, live ingest
data/clean/          committed GitHub Universe 2026 snapshot
data/fixtures/       small graph for tests
docs/                architecture and the Qodo log
```

How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE)
