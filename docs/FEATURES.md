# Hallway features

The mobile home is one screen, **Today**. It has three parts, in this order:

1. **Calendar.** The user's day. Google Calendar blocks, plus a meeting after someone accepts a message.
2. **My events.** Suggestion boxes for what this conference would give them: talks, a nearby public event, and job events only after we know the reason is a job.
3. **Network.** People they could meet, and a message they approve before it is sent.

`frontend/` draws Today. `backend/` will fill it. Neither is split into a separate app per section. The sections stay on one feed so the phone never asks the user to pick a mode.

Nothing is sent, and nobody is written onto the calendar, until a person acts. The user approves a message. The other person accepts it and picks a time. That acceptance is what adds them to the calendar.

## What the first screen asks

The first screen is not a settings form, and it does not ask about sponsorship.

Before Today can be personal, one short step collects:

| Input | Used for |
| --- | --- |
| Conference name or official URL, and the dates they will attend | Which event to load |
| What they want, in their own words | Wrapped in the fixed prompt. The feed uses the parsed result, not the raw sentence |
| Google Calendar, optional connect | Blocks already on their day |
| GitHub, optional | Topic hints for the prompt |
| LinkedIn, their own URL, optional | The profile link on a message they send |

They see the parsed line before the feed is built: "Talks, topics: platforms." They can edit the sentence and run it again.

## Sponsorship is a follow-up

Sponsorship is not on the first screen, and the fixed prompt does not decide it.

If the parsed reason is **job**, the next screen asks one question: do they want a company to sponsor them? Yes adds sponsor-company suggestions under My events. No leaves those out. Job-event suggestions still show, because the reason is already job.

If the reason is talks or meeting people, that follow-up never appears, and job and sponsor suggestions stay off the feed.

## The fixed prompt

The user's sentence is ambiguous on purpose. The app does not plan from that sentence. It puts the sentence into one prompt that is not rewritten per user, and stores only the JSON that comes back.

`reason` is `talks`, `meet`, `job`, or `unsure`. `topics` may contain only names from the list we pass in. Sponsorship is not a field in this response.

```text
You are classifying one conference visit. Return JSON only.
Do not add sessions, people, or companies. Do not explain.
Do not decide sponsorship. A later screen asks that, and only if the reason is job.

Conference: {event name}
Topics that exist at this conference: {topic names from the graph}
GitHub hints, if any: {languages and repo topics}

The user wrote:
"""
{their text, unchanged}
"""

Pick one reason:
- talks: they are here for sessions
- meet: they are here to meet people
- job: they are here for a job, hiring, or recruiting
- unsure: the text does not say

If two reasons are present, pick the one the text emphasizes. If neither is emphasized, return unsure.

Return:
{"reason":"talks|meet|job|unsure","topics":[],"summary":"one line in their words"}
```

`unsure` does not build Today. The box stays open and asks them to say it in one sentence. The raw sentence is kept on the visit. The feed reads `reason`, `topics`, and `summary`.

## 1. Calendar

The top of Today. Blocks for the selected day, in time order, with empty gaps left visible.

| Block source | How it got there |
| --- | --- |
| `google` | Sync from the user's Google Calendar |
| `connection` | Someone accepted a message and picked a free gap |
| `plan` | The user added a suggestion from My events. It appears on this calendar when they add it |

If Google is not connected, the calendar still shows connection blocks and a connect action. Adding a suggestion does not write to Google Calendar.

## 2. My events

Suggestion boxes under the calendar. Each box is what they would get at this conference: a verdict, a reason, and one action, **Add**. Add puts it on the calendar as a `plan` block if the time is free.

| Box | When it shows |
| --- | --- |
| A talk on one of their topics | Always, once the agenda is stored |
| A public nearby event (Luma or a sponsor page): name, time, venue, listed hosts | When one exists for that city and those dates |
| A job event | Only when the parsed reason is `job` |
| A sponsor company | Only when the reason is `job` and the follow-up answer is yes |

Boxes are drawn from the master graph. If this conference is not stored yet, Today says it is reading the official site. Bright Data fetches that site, and the extractor stores the event, talks, published speakers, and expo. The next person at the same event reuses it. Nearby public events are stored the same way, without guest lists. Details are in `docs/DATABASE.md`.

## 3. Network

People who share a topic with the user and are at this conference. A suggested person is someone the conference published (a speaker, a host, sponsor staff named on the public site) or another attendee who opted in and picked interests. The user's own LinkedIn and GitHub describe the user. They are not used to search LinkedIn for other attendees.

Each row is a verdict, the shared interest, where that person will be, and one action: **Message**.

The draft names the shared interest and proposes a free gap. The user can edit it, skip it, or approve it. Approving marks the connection `pending`. Nothing is marked accepted at send time.

When the other person accepts, they choose one of the free gaps. That does two writes:

1. The connection becomes `accepted`, with the time they chose.
2. A `CalendarBlock` is created for the user, source `connection`.

The calendar at the top of Today reads that block, so the meeting shows there as soon as it is accepted.

A declined or skipped message does not create a block.

History is this same data, read backwards: past `ATTENDED` events, and the connections on them. It is not a second list.

## Where the code lives

| Path | What it owns |
| --- | --- |
| `frontend/` | The Today screen: calendar, My events, network. Sample data until the backend is connected. The sponsorship follow-up screen exists and is not linked from Today. |
| `backend/src/intent` | The fixed prompt, and the sponsorship follow-up that runs only after `reason` is `job` |
| `backend/src/today` | How the three sections of the feed are loaded |
| `backend/src/graph` | FalkorDB lookups. Check the graph before any scrape |

## Build order

1. Today, with the three sections, using sample blocks.
2. The sentence and the fixed prompt, then the sponsorship follow-up only for `job`.
3. Wire My events and the calendar to the graph.
4. Network drafts, then the accept path that adds a block to the calendar.
5. History, as a view over events and connections already stored.
