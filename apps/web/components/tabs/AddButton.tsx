"use client";

import { AddToCalendarResponse, type Clash } from "@hallway/types";
import { Button } from "@primer/react";
import { CheckIcon, PlusIcon } from "@primer/octicons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./tabs.module.css";

/** "+" for sessions and side events: POST /api/calendar, then shows any clash. */
export function AddButton({ targetId, planned, clashes }: { targetId: string; planned: boolean; clashes: Clash[] }) {
  const router = useRouter();
  const [added, setAdded] = useState(planned);
  const [busy, setBusy] = useState(false);
  const [newClashes, setNewClashes] = useState<Clash[] | null>(null);
  const shown = newClashes ?? clashes;

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId }) });
      const parsed = AddToCalendarResponse.safeParse(await res.json());
      if (parsed.success) {
        setAdded(true);
        setNewClashes(parsed.data.clashes);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      {added ? (
        <Button size="small" leadingVisual={CheckIcon} disabled>
          In calendar
        </Button>
      ) : (
        <Button size="small" variant="primary" leadingVisual={PlusIcon} onClick={add} disabled={busy}>
          Add
        </Button>
      )}
      {shown.length ? (
        <p className={styles.warning}>
          {added ? "Clashes with" : "Would clash with"} {shown.map((c) => c.withTitle).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
