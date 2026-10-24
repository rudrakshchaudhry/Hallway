import { exploreFor } from "@hallway/graph/queries/explore";
import { Label } from "@primer/react";
import Link from "next/link";
import { SuggestForm } from "@/components/google/SuggestForm";
import { AddButton } from "@/components/tabs/AddButton";
import { PathButton } from "@/components/tabs/PathButton";
import { dayIn, timeIn } from "@/components/tabs/format";
import styles from "@/components/tabs/tabs.module.css";
import { context } from "@/lib/context";

export const dynamic = "force-dynamic";

/** Explore (PLAN.md 2.2): side events around the conference, with clash warnings. */
export default async function ExplorePage() {
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
  const items = await exploreFor(graph, me, conference);
  const tz = conference.tz;
  return (
    <main className={styles.page}>
      <div>
        <p className={styles.kicker}>Around {conference.name}</p>
        <h1 className={styles.title}>Explore</h1>
      </div>
      {items.length ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.event.id} className={styles.card}>
              <div className={styles.cardHead}>
                <p className={styles.cardTitle}>{item.event.name}</p>
                {item.path ? <PathButton path={item.path} /> : null}
              </div>
              <div className={styles.row}>
                <Label variant="attention">{item.event.source === "luma" ? "Luma" : "Side event"}</Label>
                <span className={styles.muted}>
                  {dayIn(item.event.start, tz)} · {timeIn(item.event.start, tz)}
                  {item.event.venue ? ` · ${item.event.venue}` : ""}
                </span>
              </div>
              <p className={styles.muted}>{item.reasons.join(" · ")}</p>
              <div className={styles.row}>
                <AddButton targetId={item.event.id} planned={item.planned} clashes={item.clashes} register={item.event.url ? { url: item.event.url, label: item.event.source === "luma" ? "Register on Luma" : "Register", title: item.event.name } : undefined} />
                {item.event.url ? (
                  <a href={item.event.url} target="_blank" rel="noreferrer" className={styles.muted}>
                    Event page →
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No side events found around this conference yet.</p>
      )}
      <h2 className={styles.sectionTitle}>Another conference?</h2>
      <p className={styles.muted}>Paste its official link and say what you want; we&apos;ll pull its published sessions.</p>
      <SuggestForm />
    </main>
  );
}
