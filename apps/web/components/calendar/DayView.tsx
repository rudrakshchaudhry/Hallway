"use client";

import type { CalendarItem } from "@hallway/types";
import { Button, Dialog, Label } from "@primer/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { dayIn, localDate, minutesIn, timeIn } from "@/components/tabs/format";
import styles from "./dayview.module.css";

const HOUR_PX = 56;
const DEFAULT_START_HOUR = 6;
const END_HOUR = 24;
const MIN_BLOCK_PX = 24;
/** Minutes a minimum-height block occupies on screen; lanes use this so short blocks never overlap. */
const MIN_BLOCK_MIN = (MIN_BLOCK_PX / HOUR_PX) * 60;
const KIND_LABEL: Record<CalendarItem["kind"], string> = { talk: "Session", event: "Side event", meeting: "Meeting", busy: "Busy" };

type Placed = { item: CalendarItem; top: number; height: number; lane: number; lanes: number; clash: boolean };

/** Minutes of `iso` relative to midnight of `day` in tz (negative = earlier day, >1440 = later). */
function minutesOnDay(iso: string, day: string, tz: string): number {
  const d = localDate(iso, tz);
  const offsetDays = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  return offsetDays * 1440 + minutesIn(iso, tz);
}

/** Items overlapping `day` (including ones that started the day before), clipped to that day. */
function spansFor(items: CalendarItem[], day: string, tz: string) {
  return items
    .map((item) => ({ item, start: Math.max(0, minutesOnDay(item.start, day, tz)), end: Math.min(1440, minutesOnDay(item.end, day, tz)) }))
    .filter((s) => s.end > s.start || (s.start === s.end && s.start < 1440 && localDate(s.item.start, tz) === day));
}

/** Lays out one day's items: position by time, overlapping items side by side in lanes. */
function layout(spans: ReturnType<typeof spansFor>, startHour: number, clashIds: Set<string>): Placed[] {
  const sorted = spans.map((s) => ({ ...s, visualEnd: Math.max(s.end, s.start + MIN_BLOCK_MIN) })).sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let group: { span: (typeof sorted)[number]; lane: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const { span, lane } of group) {
      placed.push({
        item: span.item,
        top: ((span.start - startHour * 60) / 60) * HOUR_PX,
        height: Math.max(((span.end - span.start) / 60) * HOUR_PX, MIN_BLOCK_PX),
        lane,
        lanes,
        clash: clashIds.has(span.item.id),
      });
    }
    group = [];
  };
  for (const span of sorted) {
    if (span.start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.span.visualEnd > span.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ span, lane });
    groupEnd = Math.max(groupEnd, span.visualEnd);
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
  const [picked, setDay] = useState(initial);
  // If refreshed props drop the selected day (e.g. its only plan was removed), fall back.
  const day = days.includes(picked) ? picked : initial;
  // The now-line moves every minute.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [open, setOpen] = useState<CalendarItem | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const clashes = useMemo(() => new Set(clashIds), [clashIds]);
  const spans = useMemo(() => spansFor(items, day, tz), [items, day, tz]);
  const dayItems = spans.map((s) => s.item);
  // Start the grid earlier when something is planned before 6 AM.
  const startHour = Math.min(DEFAULT_START_HOUR, ...spans.map((s) => Math.floor(s.start / 60)));
  const placed = useMemo(() => layout(spans, startHour, clashes), [spans, startHour, clashes]);
  const index = days.indexOf(day);
  const nowMinutes = minutesIn(nowIso, tz);
  const showNow = day === localDate(nowIso, tz) && nowMinutes >= startHour * 60;

  // Scroll to "now" on today, else to the first item (or 8 AM).
  useEffect(() => {
    const target = showNow ? nowMinutes : (placed[0] ? startHour * 60 + (placed[0].top / HOUR_PX) * 60 : 8 * 60);
    scroller.current?.scrollTo({ top: Math.max(0, ((target - startHour * 60) / 60) * HOUR_PX - HOUR_PX), behavior: "smooth" });
    // Re-scroll when the day changes, not on every minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, placed.length, startHour]);

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
  const counts = (d: string) => spansFor(items, d, tz).length;

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
        <div className={styles.grid} style={{ height: (END_HOUR - startHour) * HOUR_PX }}>
          {Array.from({ length: END_HOUR - startHour }, (_, i) => startHour + i).map((h) => (
            <div key={h} className={styles.hour} style={{ top: (h - startHour) * HOUR_PX }}>
              <span className={styles.hourLabel}>{h === 0 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}</span>
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
            {showNow ? <div className={styles.now} style={{ top: ((nowMinutes - startHour * 60) / 60) * HOUR_PX }} aria-label="Now" /> : null}
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
