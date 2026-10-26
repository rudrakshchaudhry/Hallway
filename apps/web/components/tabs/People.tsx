"use client";

import { InviteCreateResponse, InviteSuggestion, PeopleResponse, type DeckCard, type Tag } from "@hallway/types";
import { Button, Dialog, Flash, Label, Spinner, Textarea, TextInput } from "@primer/react";
import { CheckIcon, CopyIcon, HeartIcon, ShareIcon, XIcon } from "@primer/octicons-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { PathButton } from "./PathButton";
import { slotLabel, timeIn } from "./format";
import styles from "./tabs.module.css";

const TAGS: { id: Tag; label: string }[] = [
  { id: "shared-stack", label: "Shared stack" },
  { id: "same-topic", label: "Same topic" },
  { id: "ex-colleague", label: "Ex-colleague network" },
  { id: "in-your-sessions", label: "In your sessions" },
  { id: "hiring", label: "Hiring" },
  { id: "speaker", label: "Speaker" },
  { id: "host", label: "Host" },
];
const tagLabel = (t: Tag) => TAGS.find((x) => x.id === t)?.label ?? t;

/** People (docs/ARCHITECTURE.md#tabs, #swipe-learning): swipe deck that re-ranks from your picks; right swipe → invite. */
export function People({ tz }: { tz: string }) {
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [swipes, setSwipes] = useState(0);
  const [tag, setTag] = useState<Tag | null>(null);
  const [error, setError] = useState(false);
  const [inviting, setInviting] = useState<DeckCard | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  const load = useCallback(async (t: Tag | null) => {
    try {
      const res = await fetch(`/api/people${t ? `?tag=${t}` : ""}`);
      const parsed = PeopleResponse.parse(await res.json());
      setError(false);
      setCards(parsed.cards);
      setSwipes(parsed.swipes);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    // Fetching on tag change is the point of this effect; state is only set after the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tag);
  }, [load, tag]);

  const top = cards?.[0];

  async function decide(dir: "left" | "right") {
    if (!top) return;
    setDrag(0);
    setCards((c) => c?.slice(1) ?? null);
    await fetch("/api/people/swipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId: top.person.id, dir }) });
    setSwipes((n) => n + 1);
    if (dir === "right") setInviting(top);
    void load(tag); // re-rank with the updated preferences
  }

  const onDown = (e: PointerEvent) => {
    start.current = e.clientX;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => start.current !== null && setDrag(e.clientX - start.current);
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    if (drag > 90) void decide("right");
    else if (drag < -90) void decide("left");
    else setDrag(0);
  };

  return (
    <>
      <div className={styles.row} role="group" aria-label="Filter by tag">
        <Button size="small" variant={tag === null ? "primary" : "default"} onClick={() => setTag(null)}>
          All
        </Button>
        {TAGS.map((t) => (
          <Button key={t.id} size="small" variant={tag === t.id ? "primary" : "default"} onClick={() => setTag(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>
      {swipes >= 3 ? <Flash variant="success">Learning from your picks: the deck is re-ranked by what you swiped right on.</Flash> : null}

      {error ? <p className={styles.empty}>Couldn&apos;t load people. Pull to refresh or try again.</p> : null}
      {!cards && !error ? <Spinner /> : null}
      {cards && !top ? <p className={styles.empty}>You&apos;ve seen everyone{tag ? ` tagged ${tagLabel(tag)}` : ""}. Check My Feed for your requests.</p> : null}

      {top ? (
        <>
          <div className={styles.deck}>
            {cards?.[1] ? <Card card={cards[1]} tz={tz} behind /> : null}
            <div
              className={styles.swipeCard}
              style={{ transform: `translateX(${drag}px) rotate(${drag / 25}deg)`, transition: dragging ? "none" : undefined }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <CardBody card={top} tz={tz} />
            </div>
          </div>
          <div className={styles.actions}>
            <Button size="large" leadingVisual={XIcon} onClick={() => decide("left")} aria-label={`Pass on ${top.person.name}`}>
              Pass
            </Button>
            <Button size="large" variant="primary" leadingVisual={HeartIcon} onClick={() => decide("right")} aria-label={`Meet ${top.person.name}`}>
              Meet
            </Button>
          </div>
        </>
      ) : null}

      {inviting ? <InviteSheet card={inviting} tz={tz} onClose={() => setInviting(null)} /> : null}
    </>
  );
}

function Card({ card, tz, behind }: { card: DeckCard; tz: string; behind?: boolean }) {
  return (
    <div className={styles.swipeCard} data-behind={behind ? "true" : undefined} aria-hidden={behind}>
      <CardBody card={card} tz={tz} />
    </div>
  );
}

function CardBody({ card, tz }: { card: DeckCard; tz: string }) {
  const next = card.whereabouts[0];
  return (
    <>
      <div className={styles.row}>
        {card.person.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.person.avatar} alt="" className={styles.avatar} draggable={false} />
        ) : (
          <div className={styles.avatar} />
        )}
        <div>
          <p className={styles.cardTitle}>{card.person.name}</p>
          {card.person.headline ? <p className={styles.muted}>{card.person.headline}</p> : null}
        </div>
      </div>
      <div className={styles.row}>
        {card.tags.map((t) => (
          <Label key={t} variant={t === "shared-stack" || t === "ex-colleague" ? "success" : t === "hiring" ? "attention" : "secondary"}>
            {tagLabel(t)}
          </Label>
        ))}
      </div>
      <p>{card.reason}</p>
      <div className={styles.row}>
        <PathButton path={card.path} />
      </div>
      {next ? (
        <p className={styles.muted}>
          Find them: {next.kind === "talk" ? `"${next.talk.title}" · ${timeIn(next.talk.start, tz)}${next.talk.room ? ` · ${next.talk.room}` : ""}` : `${next.event.name} · ${timeIn(next.event.start, tz)}`}
        </p>
      ) : null}
      {card.person.about ? <p className={styles.detail}>{card.person.about}</p> : null}
    </>
  );
}

function InviteSheet({ card, tz, onClose }: { card: DeckCard; tz: string; onClose: () => void }) {
  const [suggestion, setSuggestion] = useState<InviteSuggestion | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<InviteCreateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch(`/api/invites/suggest?personId=${encodeURIComponent(card.person.id)}`)
      .then((r) => r.json())
      .then((json) => {
        const s = InviteSuggestion.parse(json);
        setSuggestion(s);
        setPicked(s.slots.map((_, i) => i));
        setPlace(s.place);
        setNote(s.note);
      })
      .catch(() => setSuggestion({ slots: [], place: "", note: "" }));
  }, [card.person.id]);

  async function send() {
    if (!suggestion) return;
    setBusy(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId: card.person.id, slots: picked.map((i) => suggestion.slots[i]), place, note }),
      });
      setSent(InviteCreateResponse.parse(await res.json()));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!sent) return;
    if (navigator.share) await navigator.share({ title: "Meet at the conference?", text: sent.shareText }).catch(() => {});
    else {
      await navigator.clipboard.writeText(sent.shareText);
      setCopied(true);
    }
  }

  return (
    <Dialog title={`Invite ${card.person.name}`} onClose={onClose} position={{ narrow: "bottom", regular: "center" }}>
      {!suggestion ? <Spinner /> : null}
      {suggestion && !sent ? (
        <div className={styles.slots}>
          <p className={styles.muted}>Offer up to 3 times; they pick one. Nothing is sent until you share the link.</p>
          {suggestion.slots.length ? (
            suggestion.slots.map((s, i) => (
              <label key={s.start} className={styles.slot}>
                <input type="checkbox" checked={picked.includes(i)} onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
                {slotLabel(s.start, s.end, tz)}
              </label>
            ))
          ) : (
            <p className={styles.warning}>No free 30-minute slots left during the conference.</p>
          )}
          <label className={styles.field}>
            Place
            <TextInput value={place} onChange={(e) => setPlace(e.target.value)} block />
          </label>
          <label className={styles.field}>
            Message
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} block rows={3} />
          </label>
          <Button variant="primary" onClick={send} disabled={busy || !picked.length || !place.trim()} block>
            Create invite link
          </Button>
        </div>
      ) : null}
      {sent ? (
        <div className={styles.slots}>
          <p>
            <CheckIcon /> Request created. It shows as <Label variant="attention">pending</Label> in My Feed until {card.person.name.split(" ")[0]} accepts.
          </p>
          <p className={styles.muted}>Exactly what you&apos;ll share:</p>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }} className={styles.card}>
            {sent.shareText}
          </pre>
          <div className={styles.row}>
            <Button variant="primary" leadingVisual={ShareIcon} onClick={share}>
              Share
            </Button>
            <Button
              leadingVisual={CopyIcon}
              onClick={async () => {
                await navigator.clipboard.writeText(sent.url);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            {card.person.linkedin ? (
              <Button as="a" href={card.person.linkedin} target="_blank" rel="noreferrer">
                Open LinkedIn
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
