"use client";

import { InvitePublicView, InviteRespondResponse } from "@hallway/types";
import { Button, Label, Spinner } from "@primer/react";
import { useEffect, useState } from "react";
import { slotLabel } from "./format";
import styles from "./tabs.module.css";

export function InviteResponse({ token }: { token: string }) {
  const [view, setView] = useState<InvitePublicView | null>(null);
  const [missing, setMissing] = useState(false);
  const [slot, setSlot] = useState(0);
  const [result, setResult] = useState<InviteRespondResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/invites/${encodeURIComponent(token)}`).then(async (r) => {
      if (!r.ok) return setMissing(true);
      setView(InvitePublicView.parse(await r.json()));
    });
  }, [token]);

  async function respond(decision: "accept" | "decline") {
    if (!view) return;
    setBusy(true);
    const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, ...(decision === "accept" ? { slot: view.slots[slot] } : {}) }),
    });
    if (res.ok) {
      const parsed = InviteRespondResponse.parse(await res.json());
      setResult(parsed);
      const slotPicked = view.slots[slot];
      if (decision === "accept" && slotPicked) setView({ ...view, status: "accepted", picked: slotPicked });
    }
    setBusy(false);
  }

  if (missing) return <p className={styles.empty}>This invite link isn&apos;t valid.</p>;
  if (!view) return <Spinner />;

  const done = result?.status ?? (view.status !== "pending" ? view.status : null);
  return (
    <section className={styles.card}>
      <p className={styles.cardTitle}>{view.requester.name} would like to meet</p>
      {view.requester.headline ? <p className={styles.muted}>{view.requester.headline}</p> : null}
      <p>{view.reason}</p>
      <p className={styles.muted}>Where: {view.place}</p>
      {done ? (
        <>
          <Label variant={done === "accepted" ? "success" : "secondary"}>{done}</Label>
          {view.picked ? <p className={styles.muted}>{slotLabel(view.picked.start, view.picked.end, view.tz)}</p> : null}
          {result?.gcalUrl ?? view.gcalUrl ? (
            <Button as="a" href={result?.gcalUrl ?? view.gcalUrl} target="_blank" rel="noreferrer" variant="primary">
              Add to Google Calendar
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <p className={styles.muted}>Pick a time:</p>
          <div className={styles.slots} role="radiogroup">
            {view.slots.map((s, i) => (
              <label key={s.start} className={styles.slot}>
                <input type="radio" name="slot" checked={slot === i} onChange={() => setSlot(i)} />
                {slotLabel(s.start, s.end, view.tz)}
              </label>
            ))}
          </div>
          <div className={styles.row}>
            <Button variant="primary" onClick={() => respond("accept")} disabled={busy}>
              Accept
            </Button>
            <Button onClick={() => respond("decline")} disabled={busy}>
              Decline
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
