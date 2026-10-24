"use client";

import { useState, type FormEvent } from "react";
import styles from "./google.module.css";

type Suggestion = { id: string; title: string; reason: string; start: string; room: string };
type Result = { ok: boolean; message: string; suggestions: Suggestion[] };

export function SuggestForm() {
  const [url, setUrl] = useState("");
  const [intent, setIntent] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, intent }),
      });
      setResult((await response.json()) as Result);
    } catch {
      setResult({
        ok: false,
        message: "Suggestions could not be loaded. Try again.",
        suggestions: [],
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 className={styles.day}>Suggestions</h2>
      <label className={styles.label}>
        Conference link
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
      </label>
      <label className={styles.label}>
        What do you want from it?
        <textarea value={intent} onChange={(event) => setIntent(event.target.value)} rows={3} />
      </label>
      <button className={styles.primary} type="submit" disabled={pending}>
        {pending ? "Looking" : "Find sessions"}
      </button>
      {result ? <p className={result.ok ? styles.muted : styles.empty}>{result.message}</p> : null}
      {result && result.suggestions.length > 0 ? (
        <ol className={styles.list}>
          {result.suggestions.map((item) => (
            <li key={item.id} className={styles.event}>
              <span className={styles.time}>{item.room || "Session"}</span>
              <div>
                <strong>{item.title}</strong>
                <p className={styles.muted}>{item.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </form>
  );
}
