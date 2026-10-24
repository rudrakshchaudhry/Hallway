import { Heading } from "@primer/react";
import { accessTokenFor, pastEvents, readSession, type CalendarEvent } from "@/lib/google";
import { Nav } from "../nav";
import { SuggestForm } from "../suggest-form";
import styles from "../page.module.css";

export default async function MyEventsPage() {
  const session = await readSession();
  if (!session) {
    return (
      <main className={styles.main}>
        <p className={styles.kicker}>My events</p>
        <Heading as="h1">Past events</Heading>
        <p className={styles.muted}>Sign in to see events already on your Google Calendar.</p>
        <a className={styles.primary} href="/api/auth/google">
          Continue with Google
        </a>
        <SuggestForm />
        <Nav current="events" />
      </main>
    );
  }

  try {
    const accessToken = await accessTokenFor(session.refreshToken);
    const events = await pastEvents(accessToken);
    const days = groupByDay(events);
    return (
      <main className={styles.main}>
        <p className={styles.kicker}>{session.email}</p>
        <Heading as="h1">My events</Heading>
        <p className={styles.muted}>Past events from your Google Calendar.</p>
        {events.length === 0 ? <p className={styles.empty}>No past events in the last 180 days.</p> : null}
        {days.map(([day, items]) => (
          <section key={day}>
            <h2 className={styles.day}>{day}</h2>
            <ol className={styles.list}>
              {items.map((event) => (
                <li key={event.id} className={styles.event}>
                  <span className={styles.time}>{event.time}</span>
                  <div>
                    <strong>{event.title}</strong>
                    {event.place ? <p className={styles.muted}>{event.place}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <SuggestForm />
        <Nav current="events" />
      </main>
    );
  } catch {
    return (
      <main className={styles.main}>
        <Heading as="h1">My events</Heading>
        <p className={styles.muted}>Google could not load past events.</p>
        <a className={styles.primary} href="/api/auth/google">
          Continue with Google
        </a>
      </main>
    );
  }
}

function groupByDay(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const day = event.day || "Undated";
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return [...groups.entries()];
}
