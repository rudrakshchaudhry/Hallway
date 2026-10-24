import { conferenceDays } from "@hallway/graph";
import { feedFor } from "@hallway/graph/queries/feed";
import { Label } from "@primer/react";
import Link from "next/link";
import { DayCalendar, type DayEvent } from "@/components/google/DayCalendar";
import { AddButton } from "@/components/tabs/AddButton";
import { PathButton } from "@/components/tabs/PathButton";
import { RequestActions } from "@/components/tabs/RequestActions";
import { dayIn, localDate, minutesIn, timeIn } from "@/components/tabs/format";
import styles from "@/components/tabs/tabs.module.css";
import { context } from "@/lib/context";
import { accessTokenFor, eventsBetween, googleConfigured, readSession, type CalendarEvent } from "@/lib/google";

export const dynamic = "force-dynamic";

const STATUS: Record<string, "attention" | "success" | "danger" | "secondary"> = { pending: "attention", accepted: "success", declined: "danger", met: "secondary" };

/** My Feed (PLAN.md 2.2): calendar on top, confirmed cards, requests sent, suggestions. */
export default async function FeedPage() {
  const { graph, me, conference } = await context();
  if (!conference) {
    return (
      <main className={styles.page}>
        <p className={styles.empty}>
          No conference yet. <Link href="/?chat=1">Start in the chat</Link>.
        </p>
      </main>
    );
  }
  const feed = await feedFor(graph, me, conference);
  const tz = conference.tz;
  const clashIds = new Set(feed.clashes.flatMap((c) => [c.itemId, c.withId]));

  // Google Calendar events on the conference days, when signed in (Track A's integration).
  let google: CalendarEvent[] = [];
  const session = googleConfigured() ? await readSession() : null;
  if (session) {
    try {
      google = await eventsBetween(await accessTokenFor(session.refreshToken), conference.start, conference.end);
    } catch {
      google = [];
    }
  }

  const days = conferenceDays(conference).map((day) => {
    const date = day.start.slice(0, 10);
    const hallway: DayEvent[] = feed.calendar
      .filter((c) => localDate(c.start, tz) === date)
      .map((c) => ({
        id: c.id,
        title: c.title,
        time: timeIn(c.start, tz),
        day: date,
        place: c.location ?? "",
        allDay: false,
        minutes: minutesIn(c.start, tz),
        source: "hallway",
        kind: c.kind === "busy" ? "Busy" : c.kind === "meeting" ? "Meeting" : c.kind === "event" ? "Event" : "Talk",
        clash: clashIds.has(c.id),
      }));
    const theirs: DayEvent[] = google.filter((g) => g.day.includes(dayIn(day.start, tz).split(", ")[1] ?? "~")).map((g) => ({ ...g, source: "google" }));
    return { label: dayIn(day.start, tz), events: [...hallway, ...theirs].sort((a, b) => (a.minutes ?? -1) - (b.minutes ?? -1)) };
  });

  return (
    <main className={styles.page}>
      <div>
        <p className={styles.kicker}>{conference.name} · {conference.venue}</p>
        <h1 className={styles.title}>My Feed</h1>
      </div>

      {googleConfigured() && !session ? (
        <a href="/api/auth/google" className={styles.muted}>
          Connect Google Calendar to see your own events here →
        </a>
      ) : null}

      {days.map((day) => (
        <DayCalendar key={day.label} label={day.label} events={day.events} />
      ))}
      {feed.clashes.length ? <p className={styles.warning}>{feed.clashes.length} clash{feed.clashes.length > 1 ? "es" : ""} in your plan</p> : null}

      <h2 className={styles.sectionTitle}>Confirmed</h2>
      {feed.confirmed.length ? (
        <ul className={styles.list}>
          {feed.confirmed.map(({ item, detail }) => (
            <li key={item.id} className={styles.card}>
              <div className={styles.cardHead}>
                <p className={styles.cardTitle}>{item.title}</p>
                {clashIds.has(item.id) ? <Label variant="danger">Clash</Label> : <Label variant="success">{item.kind === "meeting" ? "Meeting" : item.kind === "event" ? "Event" : "Session"}</Label>}
              </div>
              <p className={styles.muted}>
                {dayIn(item.start, tz)} · {timeIn(item.start, tz)}–{timeIn(item.end, tz)}
                {item.location ? ` · ${item.location}` : ""}
              </p>
              {detail ? <p className={styles.detail}>{detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Nothing confirmed yet. Add sessions from Agenda or swipe right on People.</p>
      )}

      <h2 className={styles.sectionTitle}>Requests sent</h2>
      {feed.requests.length ? (
        <ul className={styles.list}>
          {feed.requests.map(({ meeting, person }) => (
            <li key={meeting.id} className={styles.card}>
              <div className={styles.cardHead}>
                <p className={styles.cardTitle}>{person.name}</p>
                <Label variant={STATUS[meeting.status] ?? "secondary"}>{meeting.status}</Label>
              </div>
              <p className={styles.muted}>
                {meeting.start ? `${dayIn(meeting.start, tz)} · ${timeIn(meeting.start, tz)}` : `${meeting.proposed.length} times offered`} · {meeting.place}
              </p>
              <RequestActions meetingId={meeting.id} status={meeting.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No requests yet. Swipe right on someone in People.</p>
      )}

      <h2 className={styles.sectionTitle}>Suggested next</h2>
      <ul className={styles.list}>
        {feed.suggestions.map((s) => {
          if (s.kind === "session")
            return (
              <li key={s.item.talk.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <p className={styles.cardTitle}>{s.item.talk.title}</p>
                  {s.item.path ? <PathButton path={s.item.path} /> : null}
                </div>
                <p className={styles.muted}>{dayIn(s.item.talk.start, tz)} · {timeIn(s.item.talk.start, tz)} · {s.item.reasons[0]}</p>
                <AddButton targetId={s.item.talk.id} planned={s.item.planned} clashes={s.item.clashes} />
              </li>
            );
          if (s.kind === "person")
            return (
              <li key={s.card.person.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <p className={styles.cardTitle}>Meet {s.card.person.name}</p>
                  <PathButton path={s.card.path} />
                </div>
                <p className={styles.muted}>{s.card.reason}</p>
                <Link href="/people">Open People →</Link>
              </li>
            );
          return (
            <li key={s.item.event.id} className={styles.card}>
              <p className={styles.cardTitle}>{s.item.event.name}</p>
              <p className={styles.muted}>{dayIn(s.item.event.start, tz)} · {timeIn(s.item.event.start, tz)} · {s.item.reasons[0]}</p>
              <AddButton targetId={s.item.event.id} planned={s.item.planned} clashes={s.item.clashes} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
