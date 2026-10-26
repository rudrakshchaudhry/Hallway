"use client";

import type { GraphPath } from "@hallway/types";
import { Dialog, Label } from "@primer/react";
import { useState } from "react";
import styles from "./tabs.module.css";

/** "N hops" chip: the graph walk behind a recommendation (docs/ARCHITECTURE.md#tabs). */
export function PathButton({ path }: { path: GraphPath }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} aria-label="Show why">
        <Label variant="accent">{path.edges.length} hops</Label>
      </button>
      {open ? (
        <Dialog title="Why this?" onClose={() => setOpen(false)} position={{ narrow: "bottom", regular: "center" }}>
          <ol className={styles.hops}>
            {path.hops.map((hop, i) => (
              <li key={path.edges[i]?.id ?? i}>
                {hop} <span className={styles.muted}>({path.edges[i]?.type.replace(/_/g, " ").toLowerCase()})</span>
              </li>
            ))}
          </ol>
        </Dialog>
      ) : null}
    </>
  );
}
