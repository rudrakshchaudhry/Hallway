# Qodo catches

Every PR in this repo went through [Qodo](https://www.qodo.ai/) review; each finding was fixed or answered on the PR.
These are the real bugs it caught, newest last.

| PR | Finding | Fix |
| --- | --- | --- |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | Query 1 used `where` as a variable; it is a reserved Cypher keyword, so the people query would not parse | Renamed to `loc` |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | `POST /api/met/[handle]` would let any visitor on the public tunnel write meetings for another user | `me` always comes from the server (`DEMO_HANDLE` or a server-set cookie) |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | `/api/ask` and `/api/refresh-events` had no abuse limit, so anyone with the URL could drain OpenAI and Bright Data credits | Per-IP rate limit and daily cap, falling back to cached answers |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | Session ownership blocked Session 1 from creating fixtures and gave the refresh route no owner | Session 1 owns `data/fixtures`; Session 2 owns `api/refresh-events` |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | Phase 3 told the agent to merge, contradicting "never merge" | Agent lists PRs in merge order; human merges |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | ship-pr skipped the UI verifier, so UI PRs could ship without phone-width checks | ship-pr runs ui-verifier for UI changes |
| [#2](https://github.com/rudrakshchaudhry/Hallway/pull/2) | FalkorDB volume mounted at `/data`, but the image stores data in `/var/lib/falkordb/data`: the whole graph (including MET edges) would vanish on container recreate | Mount at the real data path; verified with a force-recreate |
| [#2](https://github.com/rudrakshchaudhry/Hallway/pull/2) | MCP "read-only" is only a default that `query_graph` callers can override, so the agent could write or delete the graph | Agent gets an explicit read-only tool allowlist |
| [#2](https://github.com/rudrakshchaudhry/Hallway/pull/2) | MCP healthcheck passed on any HTTP response, even a broken endpoint | Healthcheck requires a successful MCP initialize |
| [#3](https://github.com/rudrakshchaudhry/Hallway/pull/3) | Reseeding rebuilt the graph from snapshots only, erasing every "Mark as met" edge: people you already met would reappear in recommendations | Seed carries runtime MET edges into the new graph; covered by a test |
| [#3](https://github.com/rudrakshchaudhry/Hallway/pull/3) | Seed deleted the live graph before copying the new one in, so the app could see an empty graph mid-demo | Atomic `RENAME` swap |
| [#3](https://github.com/rudrakshchaudhry/Hallway/pull/3) | Schema defaults applied per source before merging, so a later source could reset stars, abstracts and opt-ins | Merge raw objects, then validate |
| [#3](https://github.com/rudrakshchaudhry/Hallway/pull/3) | GraphPath accepted disconnected "proof" walks | Edge i must join node i and i+1 |
| [#3](https://github.com/rudrakshchaudhry/Hallway/pull/3) | One failed FalkorDB connect was cached forever, breaking every later request | Clear the cached promise on failure |
| [#4](https://github.com/rudrakshchaudhry/Hallway/pull/4) | `demo:check` only checked `/api/health`, so it would pass with every demo route broken | Checks every demo route; fails until each responds in under 2 s |
| [#6](https://github.com/rudrakshchaudhry/Hallway/pull/6) | Cookie signing fell back to a public hard-coded secret, so anyone could forge a login as any user | Random per-process secret when COOKIE_SECRET is unset |
| [#6](https://github.com/rudrakshchaudhry/Hallway/pull/6) | Upserts wrote schema defaults over stored values: a profile save could clear isUser and wipe abstracts or star counts | Write only supplied fields; never demote isUser |
| [#6](https://github.com/rudrakshchaudhry/Hallway/pull/6) | Reseed dropped meetings recorded from the other side and the user's repo dependencies | Carry incoming MET/SWIPED and second-hop DEPENDS_ON |
| [#8](https://github.com/rudrakshchaudhry/Hallway/pull/8) | Profile save derived the Person id from an unverified GitHub/LinkedIn value, so anyone could take over a speaker's or user's node and be signed in as them | Taken ids/handles get a suffix; re-saves keep the signed-in user's Person |
| [#8](https://github.com/rudrakshchaudhry/Hallway/pull/8) | Profile saves overwrote shared nodes: renamed topics for everyone, reset repo stars, invented repo→package dependencies | Shared labels create-only; DEPENDS_ON only from deps actually read |
| [#12](https://github.com/rudrakshchaudhry/Hallway/pull/12) | Anyone with an invite link could accept with an arbitrary end time, or flip meeting state (declined → accepted, pending → met) via the API | End derived from duration; strict pending → accepted → met transitions |
| [#12](https://github.com/rudrakshchaudhry/Hallway/pull/12) | A Google Calendar session leaked across Hallway profiles in the same browser | Session bound to the person who connected it |
| [#12](https://github.com/rudrakshchaudhry/Hallway/pull/12) | The public suggestion form bypassed the Bright Data budget guard and had no rate limit | Budget reserve on every call; 5/min per IP |
| [#13](https://github.com/rudrakshchaudhry/Hallway/pull/13) | Day view: short back-to-back plans overlapped, overnight plans vanished on day two, plans before 6 AM showed at the wrong hour | Visual-height lanes, overlap-based day selection, adaptive grid start |
| [#14](https://github.com/rudrakshchaudhry/Hallway/pull/14) | A queued LinkedIn scrape could hold the onboarding chat open for 20 minutes | 150 s cap with a retry prompt |
| [#16](https://github.com/rudrakshchaudhry/Hallway/pull/16) | The agent's tools trusted a model-supplied user id: anyone could ask the assistant to read or change another attendee's calendar | Tools take an HMAC-signed session key; verified the spoof is refused |
| [#16](https://github.com/rudrakshchaudhry/Hallway/pull/16) | Signed-out visitors could drive the paid agent as the demo user | Agent routes require a signed-in identity |
| [#17](https://github.com/rudrakshchaudhry/Hallway/pull/17) | Two concurrent requests could both start a live ingest, because the single slot was claimed after an await | Reserve the slot synchronously before any await |
| [#17](https://github.com/rudrakshchaudhry/Hallway/pull/17) | Re-ingesting a conference duplicated every talk: ids came from list position | Stable talk ids from title and start; stale talks pruned after upsert |
| [#17](https://github.com/rudrakshchaudhry/Hallway/pull/17) | Two speakers with the same name at different companies merged into one person | Speaker ids include the company |
| [#17](https://github.com/rudrakshchaudhry/Hallway/pull/17) | Luma side events were filtered by UTC dates, dropping evening events in US time zones | Filter by venue-local dates |
| [#18](https://github.com/rudrakshchaudhry/Hallway/pull/18) | The model saw a value that doubled as the user's login cookie, with no expiry | Tools take a purpose-bound agent key that expires after 12 h and can't verify as a cookie |
| [#18](https://github.com/rudrakshchaudhry/Hallway/pull/18) | A database error during an ingest lookup left the single ingest slot occupied forever | The lookup failure marks the job failed and frees the slot |
