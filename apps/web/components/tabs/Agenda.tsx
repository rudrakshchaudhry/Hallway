"use client";

import type { AgendaItem, PastGraphResponse } from "@hallway/types";
import { Label, SegmentedControl } from "@primer/react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CalendarEvent } from "@/lib/google";
import { AddButton } from "./AddButton";
import { GraphCanvas } from "./GraphCanvas";
import { PathButton } from "./PathButton";
import { dayIn, timeIn } from "./format";
import styles from "./tabs.module.css";

const KIND: Record<string, string> = { talk: "Talk", workshop: "Workshop", keynote: "Keynote", panel: "Panel", other: "Session" };

/** Agenda (docs/ARCHITECTURE.md#tabs): Now = prioritised sessions with + and clash warnings; Past = memory graph. */
export function Agenda({ items, tz, past, googlePast }: { items: AgendaItem[]; tz: string; past: PastGraphResponse; googlePast: CalendarEvent[] | null }) {
  const router = useRouter();
  const pane = useSearchParams().get("pane") === "past" ? "past" : "now";
  const select = (i: number) => router.replace(i === 1 ? "/agenda?pane=past" : "/agenda", { scroll: false });

  return (
    <>
      <SegmentedControl aria-label="Agenda pane" fullWidth onChange={select}>
        <SegmentedControl.Button selected={pane === "now"}>Now</SegmentedControl.Button>
        <SegmentedControl.Button selected={pane === "past"}>Past</SegmentedControl.Button>
      </SegmentedControl>

      {pane === "now" ? (
        items.length ? (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.talk.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <p className={styles.cardTitle}>{item.talk.title}</p>
                  {item.path ? <PathButton path={item.path} /> : null}
                </div>
                <div className={styles.row}>
                  <Label>{KIND[item.talk.kind] ?? "Session"}</Label>
                  {item.rerun ? <Label variant="attention">Rerun · watch later</Label> : null}
                  <span className={styles.muted}>
                    {dayIn(item.talk.start, tz)} · {timeIn(item.talk.start, tz)}–{timeIn(item.talk.end, tz)}
                    {item.talk.room ? ` · ${item.talk.room}` : ""}
                  </span>
                </div>
                {item.speakers.length ? <p className={styles.muted}>{item.speakers.slice(0, 3).map((s) => s.name).join(", ")}</p> : null}
                <p className={styles.muted}>{item.reasons.join(" · ")}</p>
                <AddButton targetId={item.talk.id} planned={item.planned} clashes={item.clashes} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No sessions for this conference yet.</p>
        )
      ) : (
        <>
          <p className={styles.muted}>Everything you&apos;ve done in Hallway: conferences, sessions, swipes, meetings. Accepted meetings are green.</p>
          {past.nodes.length > 1 ? <GraphCanvas graph={past} /> : <p className={styles.empty}>Your memory graph fills up as you plan and meet people.</p>}
          {googlePast?.length ? (
            <>
              <h2 className={styles.sectionTitle}>From your Google Calendar</h2>
              <ul className={styles.list}>
                {googlePast.slice(0, 20).map((e) => (
                  <li key={e.id} className={styles.card}>
                    <p className={styles.cardTitle}>{e.title}</p>
                    <p className={styles.muted}>
                      {e.day} · {e.time}
                      {e.place ? ` · ${e.place}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
