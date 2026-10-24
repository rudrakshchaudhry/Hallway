"use client";

/**
 * Sponsorship follow-up.
 *
 * This is not the first screen and Today does not link here.
 * Open it only after backend/src/intent/prompt.ts returns reason "job".
 * Yes and no are stored on the visit. They do not change the calendar by themselves.
 * Sponsor-company cards are added under My events only when the answer is yes.
 */

import { useState } from "react";
import styles from "../today.module.css";

export default function FollowUpPage() {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);

  return (
    <main className={styles.screen}>
      <p className={styles.kicker}>Follow-up</p>
      <h1 className={styles.title}>Want a company to sponsor you?</h1>
      <p className={styles.summary}>Asked only because a job is the reason you are going.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={() => setAnswer("no")}>
          No
        </button>
        <button type="button" onClick={() => setAnswer("yes")}>
          Yes
        </button>
      </div>
      {answer ? (
        <p className={styles.note}>
          {answer === "yes"
            ? "Sponsor companies can show under My events."
            : "Job events can still show. Sponsor companies stay off the feed."}
        </p>
      ) : null}
    </main>
  );
}
