"use client";

import { AddToCalendarResponse, type Clash } from "@hallway/types";
import { Button, Dialog } from "@primer/react";
import { LinkExternalIcon, PlusIcon, TrashIcon } from "@primer/octicons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./tabs.module.css";

/**
 * Add to / remove from calendar (POST/DELETE /api/calendar) with clash warnings. For side
 * events with a registration page (e.g. Luma), adding opens a sheet to register there too.
 */
export function AddButton({
  targetId,
  planned,
  clashes,
  register,
}: {
  targetId: string;
  planned: boolean;
  clashes: Clash[];
  register?: { url: string; label: string; title: string };
}) {
  const router = useRouter();
  const [added, setAdded] = useState(planned);
  const [busy, setBusy] = useState(false);
  const [newClashes, setNewClashes] = useState<Clash[] | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const shown = newClashes ?? clashes;

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId }) });
      const parsed = AddToCalendarResponse.safeParse(await res.json());
      if (parsed.success) {
        setAdded(true);
        setNewClashes(parsed.data.clashes);
        if (register) setShowRegister(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch("/api/calendar", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId }) });
      setAdded(false);
      setNewClashes([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      {added ? (
        <Button size="small" leadingVisual={TrashIcon} onClick={remove} disabled={busy}>
          Remove from calendar
        </Button>
      ) : (
        <Button size="small" variant="primary" leadingVisual={PlusIcon} onClick={add} disabled={busy}>
          Add to calendar
        </Button>
      )}
      {register && added ? (
        <Button size="small" as="a" href={register.url} target="_blank" rel="noreferrer" trailingVisual={LinkExternalIcon}>
          {register.label}
        </Button>
      ) : null}
      {shown.length ? (
        <p className={styles.warning}>
          {added ? "Clashes with" : "Would clash with"} {shown.map((c) => c.withTitle).join(", ")}
        </p>
      ) : null}
      {showRegister && register ? (
        <Dialog
          title="Added to your calendar"
          onClose={() => setShowRegister(false)}
          position={{ narrow: "bottom", regular: "center" }}
          footerButtons={[
            { content: "Later", onClick: () => setShowRegister(false) },
            {
              content: register.label,
              buttonType: "primary",
              onClick: () => {
                window.open(register.url, "_blank", "noopener");
                setShowRegister(false);
              },
            },
          ]}
        >
          <p>
            <strong>{register.title}</strong> is on your Hallway calendar. Spots are limited, so register on the event page to
            actually get in.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
