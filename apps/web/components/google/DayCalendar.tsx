import { Label } from "@primer/react";
import type { CalendarEvent } from "@/lib/google";
import styles from "./google.module.css";

// Day calendar from Track A (PR #5 / dev): hour rows with all-day events on top. Used by My
// Feed for both Hallway plans and Google Calendar events.
export type DayEvent = CalendarEvent & { source?: "hallway" | "google"; kind?: string; clash?: boolean };

export function DayCalendar({ label, events }: { label: string; events: DayEvent[] }) {
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

function EventBody({ event }: { event: DayEvent }) {
  return (
    <div>
      <strong>{event.title}</strong>{" "}
      {event.clash ? <Label variant="danger">Clash</Label> : null}{" "}
      {event.source === "google" ? <Label variant="secondary">Google</Label> : event.kind ? <Label variant="success">{event.kind}</Label> : null}
      {event.place ? <p className={styles.muted}>{event.place}</p> : null}
    </div>
  );
}

function hourLabel(hour: number): string {
  const cycle = hour % 12 || 12;
  return `${cycle} ${hour < 12 ? "AM" : "PM"}`;
}
