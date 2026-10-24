"use client";

import { Button, Heading, Label } from "@primer/react";
import { CommentDiscussionIcon } from "@primer/octicons-react";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <Heading as="h1">Hallway</Heading>
      <p className={styles.muted}>What should you do next?</p>
      <div className={styles.labels}>
        <Label variant="success">Live-only</Label>
        <Label variant="attention">Rerun</Label>
        <Label variant="danger">Clash</Label>
      </div>
      <Button variant="primary" leadingVisual={CommentDiscussionIcon}>
        Ask
      </Button>
    </main>
  );
}
