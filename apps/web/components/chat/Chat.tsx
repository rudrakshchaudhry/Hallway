"use client";

import { ChatEvent, type Chip, type ProfileDraft } from "@hallway/types";
import { Button, Dialog, Label, Spinner, TextInput } from "@primer/react";
import { AlertIcon, CheckIcon, SyncIcon } from "@primer/octicons-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Heatmap } from "@/components/Heatmap";
import styles from "./chat.module.css";

type Entry =
  | { kind: "bot" | "user" | "error"; id: string; text: string }
  | { kind: "step"; id: string; status: "running" | "done" | "error"; text: string }
  | { kind: "intent"; id: string; text: string }
  | { kind: "profile"; id: string; draft: ProfileDraft };

let seq = 0;
const nextId = () => `e${++seq}`;

const SUGGESTIONS = ["Who should I meet?", "What clashes on Wednesday?", "Find me a talk on AI agents", "Which side events fit me?"];

/** Minimal markdown for agent answers: **bold** and "- " bullets. */
function rich(text: string): ReactNode {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = () => {
    if (bullets.length) out.push(<ul key={`ul-${out.length}`} className={styles.bullets}>{bullets}</ul>);
    bullets = [];
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) bullets.push(<li key={i}>{inline(m[1] ?? "")}</li>);
    else {
      flush();
      if (line.trim()) out.push(<p key={i} className={styles.line}>{inline(line)}</p>);
    }
  });
  flush();
  return out;
}

type Approval = { threadId: string; toolCallId: string; tool: string; preview: string };

/**
 * The Hallway chat. Onboarding mode (PLAN.md 2.1) reads POST /api/chat; agent mode (the chat
 * button, after onboarding) talks to the TrueForge agent via POST /api/agent, with approvals.
 */
export function Chat({ mode = "onboarding", name }: { mode?: "onboarding" | "agent"; name?: string }) {
  const agent = mode === "agent";
  const [approval, setApproval] = useState<Approval | null>(null);
  const streamRef = useRef<string | null>(null);
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
        case "text": {
          // Agent answers stream in deltas: grow one bubble. Onboarding sends whole lines.
          if (agent && streamRef.current) {
            const id = streamRef.current;
            return setEntries((e) => e.map((x) => (x.id === id && x.kind === "bot" ? { ...x, text: x.text + event.delta } : x)));
          }
          const id = nextId();
          if (agent) streamRef.current = id;
          return setEntries((e) => [...e, { kind: "bot", id, text: event.delta }]);
        }
        case "approval_required":
          return setApproval({ threadId: event.threadId, toolCallId: event.toolCallId, tool: event.tool, preview: event.preview });
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
    [router, agent],
  );

  const read = useCallback(
    async (url: string, payload: unknown) => {
      streamRef.current = null;
      setBusy(true);
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          handle({ type: "error", message: body?.error ?? "Something went wrong." });
          return;
        }
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
        handle({ type: "error", message: "Connection lost. Try again." });
      } finally {
        streamRef.current = null;
        setBusy(false);
      }
    },
    [handle],
  );

  const send = useCallback(
    async (body: { message?: string; chipIds?: string[] }, echo?: string) => {
      if (echo) setEntries((e) => [...e, { kind: "user", id: nextId(), text: echo }]);
      if (!agent) {
        setChips(null);
        setInput(null);
      }
      setSelected([]);
      await read(agent ? "/api/agent" : "/api/chat", { message: body.message ?? "", chipIds: body.chipIds });
    },
    [agent, read],
  );

  const decide = async (decision: "allow" | "deny") => {
    if (!approval) return;
    const pending = approval;
    setApproval(null);
    setEntries((e) => [...e, { kind: "user", id: nextId(), text: decision === "allow" ? `Allowed: ${pending.preview}` : "Not now" }]);
    await read("/api/agent/approve", { threadId: pending.threadId, toolCallId: pending.toolCallId, decision });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (agent) {
      // Greeting and suggested questions are local; nothing is sent until the user asks.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries([{ kind: "bot", id: nextId(), text: `Hi${name ? ` ${name.split(" ")[0]}` : ""}! Ask me about people to meet, sessions, side events or your calendar. I'll ask before changing anything.` }]);
      setChips({ chips: SUGGESTIONS.map((label) => ({ id: label, label })), multi: false });
      setInput({ placeholder: "Ask Hallway…" });
      return;
    }
    void send({ chipIds: ["restart"] });
  }, [send, agent, name]);

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
    if (agent) {
      router.push("/?chat=onboarding");
      return;
    }
    setEntries([]);
    void send({ chipIds: ["restart"] });
  };

  const running = entries.some((e) => e.kind === "step" && e.status === "running");

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.brand}>{agent ? "Ask Hallway" : "Hallway"}</h1>
        <div className={styles.row}>
          {agent ? (
            <Link href="/feed" className={styles.muted}>
              Back to my feed
            </Link>
          ) : null}
          <Button size="small" variant="invisible" leadingVisual={SyncIcon} onClick={restart} disabled={busy}>
            {agent ? "Redo onboarding" : "Restart"}
          </Button>
        </div>
      </header>

      <div className={styles.log} ref={logRef} aria-live="polite">
        {entries.map((entry) => {
          switch (entry.kind) {
            case "bot":
              return (
                <div key={entry.id} className={`${styles.bubble} ${styles.bot}`}>
                  {agent ? rich(entry.text) : entry.text}
                </div>
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
                <Button
                  key={chip.id}
                  onClick={() => void (agent ? send({ message: chip.label }, chip.label) : send({ chipIds: [chip.id] }, chip.label))}
                  disabled={busy}
                >
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
      {approval ? (
        <Dialog
          title="Allow this?"
          onClose={() => void decide("deny")}
          position={{ narrow: "bottom", regular: "center" }}
          footerButtons={[
            { content: "Not now", onClick: () => void decide("deny") },
            { content: "Allow", buttonType: "primary", onClick: () => void decide("allow") },
          ]}
        >
          <p>{approval.preview}</p>
          <p className={styles.muted}>Hallway asks before changing your calendar or creating invites.</p>
        </Dialog>
      ) : null}
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
      {draft.contributions ? <Heatmap total={draft.contributions.total} days={draft.contributions.days} /> : null}
    </section>
  );
}
