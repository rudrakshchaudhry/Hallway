# Qodo catches

Real findings from Qodo's PR reviews that we fixed. Used in the demo (section 12, 2:45).

| PR | Finding | Fix |
| --- | --- | --- |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | Query 1 used `where` as a variable; it is a reserved Cypher keyword, so the people query would not parse | Renamed to `loc` |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | `POST /api/met/[handle]` would let any visitor on the public tunnel write meetings for another user | `me` always comes from the server (`DEMO_HANDLE` or a server-set cookie) |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | `/api/ask` and `/api/refresh-events` had no abuse limit, so anyone with the URL could drain OpenAI and Bright Data credits | Per-IP rate limit and daily cap, falling back to cached answers |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | Session ownership blocked Session 1 from creating fixtures and gave the refresh route no owner | Session 1 owns `data/fixtures`; Session 2 owns `api/refresh-events` |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | Phase 3 told the agent to merge, contradicting "never merge" | Agent lists PRs in merge order; human merges |
| [#1](https://github.com/rudrakshchaudhry/Hallway/pull/1) | ship-pr skipped the UI verifier, so UI PRs could ship without phone-width checks | ship-pr runs ui-verifier for UI changes |
