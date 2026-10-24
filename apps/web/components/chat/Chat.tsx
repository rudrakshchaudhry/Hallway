"use client";

import { ChatEvent, type Chip, type ProfileDraft } from "@hallway/types";
import { Button, Label, Spinner, TextInput } from "@primer/react";
import { AlertIcon, CheckIcon, SyncIcon } from "@primer/octicons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./chat.module.css";

type Entry =
  | { kind: "bot" | "user" | "error"; id: string; text: string }
  | { kind: "step"; id: string; status: "running" | "done" | "error"; text: string }
  | { kind: "intent"; id: string; text: string }
  | { kind: "profile"; id: string; draft: ProfileDraft };

let seq = 0;
const nextId = () => `e${++seq}`;

/** Onboarding chat (PLAN.md 2.1): reads the NDJSON stream from POST /api/chat. */
export function Chat() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [chips, setChips] = useState<{ chips: Chip[]; multi: boolean } | null>(null);
  const [input, setInput] = useState<{ placeholder: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const handle = useCallback(
    (event: ChatEvent) => {
      switch (event.type) {
        case "text":
          return setEntries((e) => [...e, { kind: "bot", id: nextId(), text: event.delta }]);
        case "chips":
          return setChips({ chips: event.chips, multi: event.multi });
        case "input":
          return setInput({ placeholder: event.placeholder });
        case "step":
          return setEntries((e) => {
            const id = `step-${event.id}`;
            const entry: Entry = { kind: "step", id, status: event.status, text: event.summary };
            return e.some((x) => x.id === id) ? e.map((x) => (x.id === id ? entry : x)) : [...e, entry];
          });
        case "intent":
          return setEntries((e) => [
            ...e.map((x): Entry => (x.id === "step-intent" && x.kind === "step" ? { ...x, status: "done", text: "Understood" } : x)),
            { kind: "intent", id: nextId(), text: event.intent.summary },
          ]);
        case "profile_draft":
          return setEntries((e) => [...e, { kind: "profile", id: nextId(), draft: event.draft }]);
        case "error":
          return setEntries((e) => [...e, { kind: "error", id: nextId(), text: event.message }]);
        case "redirect":
          return void setTimeout(() => router.push(event.to), 600);
        default:
          return undefined;
      }
    },
    [router],
  );

  const send = useCallback(
    async (body: { message?: string; chipIds?: string[] }, echo?: string) => {
      if (echo) setEntries((e) => [...e, { kind: "user", id: nextId(), text: echo }]);
      setChips(null);
      setInput(null);
      setSelected([]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: body.message ?? "", chipIds: body.chipIds }),
        });
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (reader) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const parsed = line.trim() ? ChatEvent.safeParse(JSON.parse(line)) : null;
            if (parsed?.success) handle(parsed.data);
          }
        }
      } catch {
        handle({ type: "error", message: "Connection lost. Tap restart to try again." });
      } finally {
        setBusy(false);
      }
    },
    [handle],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send({ chipIds: ["restart"] });
  }, [send]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, chips]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    void send({ message }, message);
  };

  const restart = () => {
    setEntries([]);
    void send({ chipIds: ["restart"] });
  };

  const running = entries.some((e) => e.kind === "step" && e.status === "running");

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.brand}>Hallway</h1>
        <Button size="small" variant="invisible" leadingVisual={SyncIcon} onClick={restart} disabled={busy}>
          Restart
        </Button>
      </header>

      <div className={styles.log} ref={logRef} aria-live="polite">
        {entries.map((entry) => {
          switch (entry.kind) {
            case "bot":
              return (
                <p key={entry.id} className={`${styles.bubble} ${styles.bot}`}>
                  {entry.text}
                </p>
              );
            case "user":
              return (
                <p key={entry.id} className={`${styles.bubble} ${styles.user}`}>
                  {entry.text}
                </p>
              );
            case "error":
              return (
                <p key={entry.id} className={styles.error}>
                  <AlertIcon /> {entry.text}
                </p>
              );
            case "step":
              return (
                <p key={entry.id} className={styles.step}>
                  {entry.status === "running" ? <Spinner size="small" /> : entry.status === "done" ? <CheckIcon /> : <AlertIcon />}
                  {entry.text}
                </p>
              );
            case "intent":
              return (
                <p key={entry.id} className={styles.step}>
                  <Label variant="accent">Got it</Label> {entry.text}
                </p>
              );
            case "profile":
              return <ProfileCard key={entry.id} draft={entry.draft} />;
          }
        })}
        {busy && !running ? <Spinner size="small" /> : null}
      </div>

      <div className={styles.dock}>
        {chips ? (
          <div className={styles.chips} role="group" aria-label="Quick replies">
            {chips.chips.map((chip) =>
              chips.multi ? (
                <Button
                  key={chip.id}
                  variant={selected.includes(chip.id) ? "primary" : "default"}
                  aria-pressed={selected.includes(chip.id)}
                  onClick={() => setSelected((s) => (s.includes(chip.id) ? s.filter((x) => x !== chip.id) : [...s, chip.id]))}
                >
                  {chip.label}
                </Button>
              ) : (
                <Button key={chip.id} onClick={() => void send({ chipIds: [chip.id] }, chip.label)} disabled={busy}>
                  {chip.label}
                </Button>
              ),
            )}
            {chips.multi ? (
              <Button
                variant="primary"
                disabled={!selected.length || busy}
                onClick={() => void send({ chipIds: selected }, chips.chips.filter((c) => selected.includes(c.id)).map((c) => c.label).join(", "))}
              >
                Continue
              </Button>
            ) : null}
          </div>
        ) : null}
        {input ? (
          <form className={styles.form} onSubmit={submit}>
            <TextInput
              aria-label={input.placeholder}
              placeholder={input.placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              block
            />
            <Button type="submit" variant="primary" disabled={!text.trim() || busy}>
              Send
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

function ProfileCard({ draft }: { draft: ProfileDraft }) {
  return (
    <section className={styles.card} aria-label="Your profile">
      <h2 className={styles.cardTitle}>{draft.name ?? "You"}</h2>
      {draft.headline ? <p className={styles.muted}>{draft.headline}</p> : null}
      {draft.skills.length ? (
        <div className={styles.labels}>
          {draft.skills.map((s) => (
            <Label key={s}>{s}</Label>
          ))}
        </div>
      ) : null}
      {draft.topics.length ? (
        <div className={styles.labels}>
          {draft.topics.map((t) => (
            <Label key={t} variant="accent">
              {t}
            </Label>
          ))}
        </div>
      ) : null}
      {draft.repos.length ? (
        <p className={styles.muted}>
          {draft.repos.length} repos{draft.packages.length ? ` · ${draft.packages.length} dependencies` : ""}
        </p>
      ) : null}
      {draft.companies.length ? <p className={styles.muted}>{draft.companies.map((c) => c.name).join(" · ")}</p> : null}
    </section>
  );
}
