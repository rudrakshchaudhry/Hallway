"use client";

/**
 * Today is the whole home screen.
 *
 * Order is fixed: calendar, then My events, then network.
 * Calendar shows Google blocks and meetings someone accepted.
 * My events shows what this conference would give them. Add pins a card
 * onto the calendar as a plan block. It does not write to Google.
 * Network opens a draft. Approve marks it pending in this preview only.
 * A real accept, in backend/src/today/network.ts, is what adds the person
 * to the calendar.
 *
 * Sponsorship is not on this screen. frontend/app/follow-up/page.tsx
 * is the next screen, and only after the prompt returns reason "job".
 */

import { useState } from "react";
import {
  calendar as seedCalendar,
  draftFor,
  people,
  sampleSummary,
  suggestions,
  type CalendarBlock,
  type PersonCard,
} from "@/lib/sample";
import styles from "./today.module.css";

export function TodayFeed() {
  const [blocks, setBlocks] = useState<CalendarBlock[]>(seedCalendar);
  const [added, setAdded] = useState<string[]>([]);
  const [draftForPerson, setDraftForPerson] = useState<PersonCard | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string[]>([]);

  function addSuggestion(id: string) {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion || added.includes(id)) return;
    setAdded((current) => [...current, id]);
    setBlocks((current) =>
      [...current, {
        id: suggestion.id,
        time: suggestion.time,
        title: suggestion.verdict,
        detail: suggestion.place,
        source: "plan" as const,
      }].sort((a, b) => a.time.localeCompare(b.time)),
    );
  }

  function openDraft(person: PersonCard) {
    setDraftForPerson(person);
    setDraft(draftFor(person));
  }

  function approveDraft() {
    if (!draftForPerson) return;
    setPending((current) => [...current, draftForPerson.id]);
    setDraftForPerson(null);
  }

  return (
    <main className={styles.screen}>
      <p className={styles.kicker}>Thursday · Sample Conf</p>
      <h1 className={styles.title}>Today</h1>
      <p className={styles.summary}>{sampleSummary}</p>
      <p className={styles.note}>Sample day, until your conference is in the database.</p>

      <section className={styles.section} aria-label="Calendar">
        <h2 className={styles.sectionTitle}>Calendar</h2>
        {blocks.map((block) => (
          <article key={block.id} className={styles.block}>
            <span className={styles.time}>{block.time}</span>
            <div>
              <strong>{block.title}</strong>
              <p className={styles.detail}>{block.detail}</p>
              <span className={tagClass(block.source)}>{labelFor(block.source)}</span>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.section} aria-label="My events">
        <h2 className={styles.sectionTitle}>My events</h2>
        <div className={styles.grid}>
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className={styles.card}>
              <span className={styles.time}>{suggestion.time}</span>
              <strong>{suggestion.verdict}</strong>
              <p>{suggestion.reason}</p>
              <p>{suggestion.place}</p>
              <button
                type="button"
                data-added={added.includes(suggestion.id)}
                onClick={() => addSuggestion(suggestion.id)}
              >
                {added.includes(suggestion.id) ? "Added" : "Add"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-label="Network">
        <h2 className={styles.sectionTitle}>Network</h2>
        {people.map((person) => (
          <article key={person.id} className={styles.person}>
            <div className={styles.avatar} aria-hidden="true">
              {person.name.slice(0, 1)}
            </div>
            <div>
              <strong>{person.name}</strong>
              <p>{person.role}</p>
              <p>{person.where}</p>
            </div>
            <button type="button" onClick={() => openDraft(person)} disabled={pending.includes(person.id)}>
              {pending.includes(person.id) ? "Pending" : "Message"}
            </button>
          </article>
        ))}
      </section>

      {draftForPerson ? (
        <div className={styles.sheet} role="presentation">
          <form
            role="dialog"
            aria-labelledby="draft-title"
            onSubmit={(event) => {
              event.preventDefault();
              approveDraft();
            }}
          >
            <h2 id="draft-title" className={styles.sectionTitle}>Message {draftForPerson.name}</h2>
            <p className={styles.detail}>Nothing is sent until they accept a time. That is what adds them to your calendar.</p>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Message" />
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={() => setDraftForPerson(null)}>
                Skip
              </button>
              <button type="submit">Approve</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function labelFor(source: CalendarBlock["source"]): string {
  if (source === "google") return "Google";
  if (source === "connection") return "Accepted";
  return "Added";
}

function tagClass(source: CalendarBlock["source"]): string {
  if (source === "google") return `${styles.tag} ${styles.tagGoogle}`;
  if (source === "connection") return `${styles.tag} ${styles.tagMeet}`;
  return styles.tag;
}
