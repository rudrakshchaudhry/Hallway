import { Heading } from "@primer/react";
import { accessTokenFor, readSession, todaysEvents, type CalendarEvent } from "@/lib/google";
import { Nav } from "./nav";
import { SignIn } from "./sign-in";
import styles from "./page.module.css";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const params = await searchParams;
  const session = await readSession();
  if (!session) return <SignIn failed={Boolean(params.auth)} />;

  try {
    const accessToken = await accessTokenFor(session.refreshToken);
    const day = await todaysEvents(accessToken);
    return (
      <main className={styles.main}>
        <p className={styles.kicker}>{session.email}</p>
        <Heading as="h1">Today</Heading>
        <DayCalendar label={day.label} events={day.events} />
        <form action="/api/auth/logout" method="post">
          <button className={styles.textButton} type="submit">
            Sign out
          </button>
        </form>
        <Nav current="today" />
      </main>
    );
  } catch (error) {
    console.error(error);
    return (
      <main className={styles.main}>
        <Heading as="h1">Today</Heading>
        <p className={styles.muted}>Google could not load this calendar.</p>
        <a className={styles.primary} href="/api/auth/google">
          Continue with Google
        </a>
        <Nav current="today" />
      </main>
    );
  }
}

function DayCalendar({ label, events }: { label: string; events: CalendarEvent[] }) {
  const allDay = events.filter((event) => event.minutes === null);
  const timed = events.filter((event) => event.minutes !== null);
  const first = timed.reduce((earliest, event) => Math.min(earliest, event.minutes ?? earliest), 8 * 60);
  const last = timed.reduce((latest, event) => Math.max(latest, event.minutes ?? latest), 18 * 60);
  const startHour = Math.min(8, Math.floor(first / 60));
  const endHour = Math.max(18, Math.floor(last / 60));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);

  return (
    <section className={styles.calendar} aria-label={label}>
      <p className={styles.dateLabel}>{label}</p>
      {events.length === 0 ? <p className={styles.empty}>No events</p> : null}
      {allDay.length > 0 ? (
        <ul className={styles.list}>
          {allDay.map((event) => (
            <li key={event.id} className={styles.event}>
              <span className={styles.time}>All day</span>
              <EventBody event={event} />
            </li>
          ))}
        </ul>
      ) : null}
      <ol className={styles.hours}>
        {hours.map((hour) => {
          const row = timed.filter((event) => Math.floor((event.minutes ?? 0) / 60) === hour);
          return (
            <li key={hour} className={styles.hour}>
              <span className={styles.time}>{hourLabel(hour)}</span>
              <div>
                {row.length === 0 ? <span className={styles.muted}> </span> : null}
                {row.map((event) => (
                  <EventBody key={event.id} event={event} />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EventBody({ event }: { event: CalendarEvent }) {
  return (
    <div>
      <strong>{event.title}</strong>
      {event.place ? <p className={styles.muted}>{event.place}</p> : null}
    </div>
  );
}

function hourLabel(hour: number): string {
  const cycle = hour % 12 || 12;
  return `${cycle} ${hour < 12 ? "AM" : "PM"}`;
}
