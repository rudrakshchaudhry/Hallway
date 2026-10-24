# Track queries

One file per track area, imported as `@hallway/graph/queries/<name>` (no shared index, so
tracks never edit the same file):

- Track A: `feed.ts`, `agenda.ts`, `past.ts`
- Track B: `people.ts`, `invites.ts`, `explore.ts`

Use `getGraph()` from `@hallway/graph`, keep every Cypher parameterised, set `id` on every
edge you write (`edgeId` from `@hallway/types`), and add a `<name>.test.ts` against the
fixture graph (see `../calendar.test.ts` for the per-run test graph pattern). Calendar,
clash and free-slot logic comes from `@hallway/graph` (`getCalendar`, `findClashes`,
`freeSlots`, `conferenceDays`); don't reimplement it.
