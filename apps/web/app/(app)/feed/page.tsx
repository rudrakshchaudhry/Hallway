import { getProfileSummary } from "@hallway/graph";
import { feedFor } from "@hallway/graph/queries/feed";
import { Label } from "@primer/react";
import Link from "next/link";
import { Heatmap } from "@/components/Heatmap";
import { DayView } from "@/components/calendar/DayView";
import { AddButton } from "@/components/tabs/AddButton";
import { PathButton } from "@/components/tabs/PathButton";
import { RequestActions } from "@/components/tabs/RequestActions";
import { dayIn, localDate, timeIn } from "@/components/tabs/format";
import styles from "@/components/tabs/tabs.module.css";
import { context } from "@/lib/context";
import { fetchContributions } from "@/lib/github";

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
  const [feed, profile] = await Promise.all([feedFor(graph, me, conference), getProfileSummary(graph, me)]);
  const contributions = profile?.github ? await fetchContributions(profile.github) : null;
  const tz = conference.tz;
  const clashIds = new Set(feed.clashes.flatMap((c) => [c.itemId, c.withId]));

  // Days shown: the conference plus a day either side (side events), plus any day with plans.
  const dayList = (() => {
    const set = new Set(feed.calendar.map((c) => localDate(c.start, tz)));
    const first = new Date(`${localDate(conference.start, tz)}T12:00:00Z`);
    const last = new Date(`${localDate(conference.end, tz)}T12:00:00Z`);
    for (let d = new Date(first.getTime() - 86_400_000); d.getTime() <= last.getTime() + 86_400_000; d = new Date(d.getTime() + 86_400_000)) {
      set.add(d.toISOString().slice(0, 10));
    }
    return [...set].sort();
  })();

  return (
    <main className={styles.page}>
      <div>
        <p className={styles.kicker}>{conference.name} · {conference.venue}</p>
        <h1 className={styles.title}>My Feed</h1>
      </div>

      {contributions ? (
        <section className={styles.card}>
          <Heatmap total={contributions.total} days={contributions.days} label={`contributions by @${profile?.github} in the last year`} />
        </section>
      ) : null}

      <DayView items={feed.calendar} tz={tz} days={dayList} clashIds={[...clashIds]} />
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
              {item.kind === "talk" || item.kind === "event" ? <AddButton targetId={item.id} planned clashes={[]} /> : null}
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
              <AddButton targetId={s.item.event.id} planned={s.item.planned} clashes={s.item.clashes} register={s.item.event.url ? { url: s.item.event.url, label: s.item.event.source === "luma" ? "Register on Luma" : "Register", title: s.item.event.name } : undefined} />
            </li>
          );
        })}
      </ul>
    </main>
  );
}
