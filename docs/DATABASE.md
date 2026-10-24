# Database lookout

Hallway has one master database: a FalkorDB graph. Conferences, talks, the user's calendar, and the people they met are nodes and edges in that graph. There is no second store for history or for the home calendar.

Check the graph before any scrape. A repeat visit to a conference that is already stored does not call Bright Data.

`docs/DATA.md` is the earlier call-sheet contract. This file replaces it for the three home features.

## Lookout order

Run these in order for one `userId` and one day.

| Step | Question | If it is missing |
| --- | --- | --- |
| 1 | Does this `userId` exist? | Create the `Person` at sign-in. Sign-in assigns the id. The client does not choose it. |
| 2 | Which `CalendarBlock`s does this user already have today? | Home renders an empty day and a connect-calendar action. |
| 3 | Does an `Event` match the official URL, the slug, or the name plus the user's dates? | Scrape the official conference site, then `MERGE` the event, its talks, its published speakers, and its expo. |
| 4 | Has this user `ATTENDED` that event, with a parsed reason? | Store their sentence. Run the fixed prompt in `docs/FEATURES.md`. Save `reason`, `summary`, and `INTERESTED_IN` edges for topics that exist on the event. If `reason` is `unsure`, stop and ask again. The prompt does not set sponsorship. If `reason` is `job`, the next screen asks the yes or no and only then saves `sponsorship`. |
| 5 | Are there talks, and, if the parsed reason is `job`, job events and sponsor booths? | Plan my day shows only what is already stored. Job boxes stay hidden unless `ATTENDED.reason` is `job`. Sponsor boxes stay hidden unless the reason is `job` and `ATTENDED.sponsorship` is true. |
| 6 | Who shares an interest with this user at this event, and is not already connected? | Who to meet shows nobody, with an empty state, until speakers or opted-in attendees exist. |
| 7 | Are there public nearby events for this city and these dates? | Events around me shows the empty state. A later refresh can fetch public Luma and sponsor pages. |

Loading a new conference `MERGE`s on `Event.slug`. It does not wipe another conference already in the graph.

An event is reused when `status` is `ready` and `scrapedAt` is within 12 hours. Older than that, screens still read the stored graph, and the official agenda refreshes in the background. `partial` means the agenda is stored and enrichment is still running. Screens skip any card whose reason needs missing fields.

## Nodes

| Node | Key | Properties | Written by |
| --- | --- | --- | --- |
| **Person** | `userId` if they signed in, otherwise `key` | `userId`, `key`, `name`, `role`, `companyName`, `avatar`, `linkedin`, `github`, `optedIn` | Sign-in, or a scrape of a published speaker, host, or named sponsor |
| **Event** | `slug` | `name`, `officialUrl`, `city`, `venue`, `start`, `end`, `timezone`, `scrapedAt`, `status` | Official conference site |
| **Talk** | `{slug}:{sourceId}` | `title`, `abstract`, `start`, `end`, `room`, `track`, `day` | Official agenda |
| **Company** | `name` + `eventSlug` | `booth`, `hiring` | Official expo page. Jobs enrich `hiring` later |
| **SideEvent** | `url` | `name`, `start`, `end`, `venue`, `city`, `source` | Public Luma or sponsor event page |
| **Topic** | `name` | | Agenda track, or an interest the user confirmed |
| **CalendarBlock** | `id` | `title`, `start`, `end`, `day`, `source`, `externalId` | Google sync, an accepted connection, or a suggestion the user kept |
| **Connection** | `{userId}:{personKey}:{eventSlug}` | `status`, `draft`, `at`, `slotStart`, `slotEnd` | Who to meet |
| **PastTalk** | `url` | `title`, `conf`, `year` | A public earlier talk by a speaker already on the agenda |

`Person.key` is the GitHub handle, the public LinkedIn URL, or `slugify(name + companyName)`, in that order. An app user with neither profile uses `userId` as `key` until one is linked. Scraped people do not get a `userId`. `optedIn` is true only for someone who signed in.

`CalendarBlock.source` is `google`, `connection`, or `plan`. `externalId` is the Google event id when the block came from Google, so a later sync updates that block instead of duplicating it.

`Connection.status` is `draft`, `pending`, `accepted`, or `declined`.

## Edges

```text
(Talk)-[:PART_OF]->(Event)
(Company)-[:EXHIBITS_AT {booth}]->(Event)
(Person)-[:SPEAKS_AT]->(Talk)
(Person)-[:WORKS_AT]->(Company)
(Talk)-[:ABOUT]->(Topic)
(Person)-[:INTERESTED_IN]->(Topic)
(Person)-[:GAVE]->(PastTalk)
(Talk)-[:SIMILAR_TO {score}]->(PastTalk)
(SideEvent)-[:DURING]->(Event)
(Person)-[:HOSTS]->(SideEvent)

(Person {userId})-[:ATTENDED {days, intent, reason, sponsorship, summary, createdAt}]->(Event)
(Person {userId})-[:HAS_BLOCK]->(CalendarBlock)
(CalendarBlock)-[:AT]->(Event)
(Person {userId})-[:MADE]->(Connection)-[:WITH]->(Person)
(Connection)-[:AT]->(Event)
(Connection)-[:BOOKED]->(CalendarBlock)
```

`ATTENDED.days` is the list of dates this user is actually there. `ATTENDED.intent` is their sentence, unchanged. `ATTENDED.reason` is the parsed value: `talks`, `meet`, or `job`. `unsure` is not stored, because no day is built until they rewrite the sentence. `ATTENDED.sponsorship` is unset until the follow-up screen, and that screen is shown only when `reason` is `job`. Any other reason leaves it unset, and job and sponsor blocks are not queried. `ATTENDED.summary` is the one line shown back to them before Today is built. Topics from the prompt become `INTERESTED_IN` edges, and only when that `Topic` already exists on the event.

One `Event` is shared by everyone at that conference. Each user has their own `ATTENDED` edge, their own `CalendarBlock`s, and their own `Connection`s.

## Home calendar

```cypher
MATCH (u:Person {userId: $userId})-[:HAS_BLOCK]->(b:CalendarBlock)
WHERE b.day = $day AND b.source IN ['google', 'connection']
RETURN b.title, b.start, b.end, b.source
ORDER BY b.start
```

`plan` blocks stay on the Plan screen until the user adds one to the home day. Promoting it sets `source` to stay `plan` and adds it to this query only when they explicitly pin it. Pinned plan blocks use `source = 'plan'` and `pinned = true`. The home query includes those:

```cypher
MATCH (u:Person {userId: $userId})-[:HAS_BLOCK]->(b:CalendarBlock)
WHERE b.day = $day AND (b.source IN ['google', 'connection'] OR b.pinned = true)
RETURN b
ORDER BY b.start
```

## Accepted message writes the calendar

```cypher
MATCH (u:Person {userId: $userId})-[:MADE]->(c:Connection {id: $connectionId})-[:WITH]->(p:Person)
MATCH (c)-[:AT]->(e:Event)
SET c.status = 'accepted', c.slotStart = $start, c.slotEnd = $end, c.at = timestamp()
MERGE (b:CalendarBlock {id: $connectionId})
SET b.title = 'Meet ' + p.name, b.start = $start, b.end = $end,
    b.day = $day, b.source = 'connection'
MERGE (u)-[:HAS_BLOCK]->(b)
MERGE (b)-[:AT]->(e)
MERGE (c)-[:BOOKED]->(b)
```

The slot must fall inside a gap: no other `CalendarBlock` for that user overlaps `start` and `end`. The home page then shows the block on the next read. No second calendar is updated by hand.

## Event lookup

Dates are ISO-8601 strings.

```cypher
MATCH (e:Event)
WHERE e.officialUrl = $url
   OR e.slug = $slug
   OR (toLower(e.name) CONTAINS toLower($name)
       AND e.start <= $lastDay
       AND e.end >= $firstDay)
RETURN e.slug, e.name, e.start, e.end, e.scrapedAt, e.status
LIMIT 1
```

```cypher
MATCH (u:Person {userId: $userId})-[a:ATTENDED]->(e:Event {slug: $slug})
RETURN a.days, a.intent, a.reason, a.sponsorship, a.summary
```

## Who to meet

Speakers on this event whose talk is about a topic the user chose, excluding people already connected:

```cypher
MATCH (u:Person {userId: $userId})-[:ATTENDED]->(e:Event {slug: $slug})
MATCH (u)-[:INTERESTED_IN]->(topic:Topic)
MATCH (p:Person)-[:SPEAKS_AT]->(talk:Talk)-[:PART_OF]->(e)
MATCH (talk)-[:ABOUT]->(topic)
WHERE NOT (u)-[:MADE]->(:Connection)-[:WITH]->(p)
RETURN p.key, p.name, p.role, p.linkedin, collect(DISTINCT topic.name) AS shared
```

Opted-in attendees at the same event are the same walk, with `(p)-[:ATTENDED]->(e)` and `p.optedIn = true` instead of `SPEAKS_AT`. A person with no `userId` is on the graph only because a public page named them.

## History

```cypher
MATCH (u:Person {userId: $userId})-[a:ATTENDED]->(e:Event)
WHERE e.end < $today
OPTIONAL MATCH (u)-[:MADE]->(c:Connection)-[:AT]->(e)
OPTIONAL MATCH (c)-[:WITH]->(p:Person)
RETURN e.slug, e.name, e.start, e.end, a.days,
       collect(DISTINCT {name: p.name, status: c.status, at: c.at}) AS people
ORDER BY e.end DESC
```

## Nearby events

```cypher
MATCH (s:SideEvent)
WHERE s.city = $city AND s.start >= $firstDay AND s.start <= $lastDay
RETURN s.name, s.start, s.end, s.venue, s.url, s.source
ORDER BY s.start
```

`source` is `luma` or the public page it came from. Store the event and the hosts named on that page. Do not store a guest list.

## What a scrape may add

| Source | Becomes | When |
| --- | --- | --- |
| Official conference site | `Event`, `Talk`, published `Person`, `Company` | The event lookup misses |
| LinkedIn profile and company datasets | Role and company on a person or sponsor **already named, with a profile URL, on that official site** | After the agenda is stored |
| LinkedIn jobs for those sponsors | `Company.hiring` | Only if `ATTENDED.reason` is `job` |
| Public Luma and sponsor event pages | `SideEvent` and `HOSTS` | Events around me, on a miss for that city and those dates |
| Google Calendar | `CalendarBlock` with `source = 'google'` | After the user connects it |
| GitHub REST | Topics on the signed-in user, from their public repos | After they give a GitHub profile |

The user's own LinkedIn URL and GitHub handle are typed by them. They are stored on their `Person`. They are not a query for other people.

## Invariants

- Every app user has a `userId`. Scraped people do not.
- One `ATTENDED` edge per user and event.
- One `Connection` per user, person, and event.
- An accepted connection has exactly one `CalendarBlock`, and that block is what the home page shows.
- A `draft`, `pending`, or `declined` connection has no `CalendarBlock`.
- Suggestion text, talk titles, rooms, and times come from stored nodes. A missing field stays empty. It is not filled in by the model.
