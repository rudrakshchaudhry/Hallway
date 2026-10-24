"use client";

import { CommentDiscussionIcon } from "@primer/octicons-react";
import Link from "next/link";
import styles from "./shell.module.css";

/** Reopens the Hallway chat (update your profile, goals or conference). */
export function ChatButton() {
  return (
    <Link href="/?chat=1" className={styles.chat} aria-label="Open Hallway chat">
      <CommentDiscussionIcon size={24} />
    </Link>
  );
}
