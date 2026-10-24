"use client";

import type { CalendarItem } from "@hallway/types";
import { Button, Dialog, Label } from "@primer/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { dayIn, localDate, minutesIn, timeIn } from "@/components/tabs/format";
import styles from "./dayview.module.css";

const HOUR_PX = 56;
const START_HOUR = 6;
const END_HOUR = 24;
const KIND_LABEL: Record<CalendarItem["kind"], string> = { talk: "Session", event: "Side event", meeting: "Meeting", busy: "Busy" };

type Placed = { item: CalendarItem; top: number; height: number; lane: number; lanes: number; clash: boolean };

/** Lays out one day's items: position by time, overlapping items side by side in lanes. */
function layout(items: CalendarItem[], tz: string, clashIds: Set<string>): Placed[] {
  const spans = items
    .map((item) => {
      const start = Math.max(minutesIn(item.start, tz), START_HOUR * 60);
      const sameDay = localDate(item.end, tz) === localDate(item.start, tz);
      const end = sameDay ? Math.min(Math.max(minutesIn(item.end, tz), start + 15), END_HOUR * 60) : END_HOUR * 60;
      return { item, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let group: { span: (typeof spans)[number]; lane: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const { span, lane } of group) {
      placed.push({
        item: span.item,
        top: ((span.start - START_HOUR * 60) / 60) * HOUR_PX,
        height: Math.max(((span.end - span.start) / 60) * HOUR_PX, 24),
        lane,
        lanes,
        clash: clashIds.has(span.item.id),
      });
    }
    group = [];
  };
  for (const span of spans) {
    if (span.start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.span.end > span.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ span, lane });
    groupEnd = Math.max(groupEnd, span.end);
  }
  flush();
  return placed;
}

/**
 * My Feed calendar: one full day (6 AM–midnight) at a time, with prev/next, day chips and
 * swipe to switch days. Blocks are sized by duration; overlaps sit side by side; clashes are
 * outlined red; a "now" line shows on today. Tap a block for details.
 */
export function DayView({ items, tz, days, clashIds }: { items: CalendarItem[]; tz: string; days: string[]; clashIds: string[] }) {
  const today = localDate(new Date().toISOString(), tz);
  const initial = days.includes(today) ? today : (days.find((d) => items.some((i) => localDate(i.start, tz) === d)) ?? days[0]!);
  const [day, setDay] = useState(initial);
  const [open, setOpen] = useState<CalendarItem | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const clashes = useMemo(() => new Set(clashIds), [clashIds]);
  const dayItems = useMemo(() => items.filter((i) => localDate(i.start, tz) === day), [items, tz, day]);
  const placed = useMemo(() => layout(dayItems, tz, clashes), [dayItems, tz, clashes]);
  const index = days.indexOf(day);
  const now = new Date();
  const nowMinutes = minutesIn(now.toISOString(), tz);
  const showNow = day === today && nowMinutes >= START_HOUR * 60;

  // Scroll to "now" on today, else to the first item (or 8 AM).
  useEffect(() => {
    const target = showNow ? nowMinutes : (placed[0] ? START_HOUR * 60 + (placed[0].top / HOUR_PX) * 60 : 8 * 60);
    scroller.current?.scrollTo({ top: Math.max(0, ((target - START_HOUR * 60) / 60) * HOUR_PX - HOUR_PX), behavior: "smooth" });
  }, [day, placed, showNow, nowMinutes]);

  const go = (delta: number) => {
    const next = days[index + delta];
    if (next) setDay(next);
  };
  const onDown = (e: PointerEvent) => {
    swipeStart.current = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
  };
  const label = (d: string) => dayIn(`${d}T12:00:00Z`, "UTC");
  const counts = (d: string) => items.filter((i) => localDate(i.start, tz) === d).length;

  return (
    <section className={styles.wrap} aria-label="Your day">
      <div className={styles.header}>
        <Button variant="invisible" aria-label="Previous day" icon={ChevronLeftIcon} onClick={() => go(-1)} disabled={index <= 0} />
        <div className={styles.dayTitle}>
          <strong>{label(day)}</strong>
          {day === today ? <Label variant="accent">Today</Label> : null}
          <span className={styles.muted}>{dayItems.length ? `${dayItems.length} planned` : "Nothing planned"}</span>
        </div>
        <Button variant="invisible" aria-label="Next day" icon={ChevronRightIcon} onClick={() => go(1)} disabled={index >= days.length - 1} />
      </div>

      <div className={styles.chips} role="tablist" aria-label="Days">
        {days.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={d === day} className={styles.chip} onClick={() => setDay(d)}>
            <span>{label(d).split(",")[0]}</span>
            <strong>{Number(d.slice(8))}</strong>
            {counts(d) ? <span className={styles.dot} aria-label={`${counts(d)} items`} /> : <span className={styles.dotEmpty} />}
          </button>
        ))}
      </div>

      <div className={styles.scroller} ref={scroller} onPointerDown={onDown} onPointerUp={onUp}>
        <div className={styles.grid} style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map((h) => (
            <div key={h} className={styles.hour} style={{ top: (h - START_HOUR) * HOUR_PX }}>
              <span className={styles.hourLabel}>{h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}</span>
            </div>
          ))}
          <div className={styles.lanes}>
            {placed.map((p) => (
              <button
                key={p.item.id}
                type="button"
                className={styles.block}
                data-kind={p.item.kind}
                data-clash={p.clash || undefined}
                data-short={p.height < 48 || undefined}
                style={{ top: p.top, height: p.height, left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 4px)` }}
                onClick={() => setOpen(p.item)}
              >
                <span className={styles.blockTitle}>{p.item.title}</span>
                {p.height >= 48 ? (
                  <span className={styles.blockMeta}>
                    {timeIn(p.item.start, tz)}
                    {p.item.location ? ` · ${p.item.location}` : ""}
                  </span>
                ) : null}
              </button>
            ))}
            {showNow ? <div className={styles.now} style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_PX }} aria-label="Now" /> : null}
          </div>
        </div>
      </div>

      {open ? (
        <Dialog title={open.title} onClose={() => setOpen(null)} position={{ narrow: "bottom", regular: "center" }}>
          <p>
            <Label variant={clashes.has(open.id) ? "danger" : "secondary"}>{clashes.has(open.id) ? "Clash" : KIND_LABEL[open.kind]}</Label>
          </p>
          <p>
            {label(localDate(open.start, tz))} · {timeIn(open.start, tz)}–{timeIn(open.end, tz)}
          </p>
          {open.location ? <p className={styles.muted}>{open.location}</p> : null}
        </Dialog>
      ) : null}
    </section>
  );
}
