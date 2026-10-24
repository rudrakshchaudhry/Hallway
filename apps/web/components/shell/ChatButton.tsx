"use client";

import { CommentDiscussionIcon } from "@primer/octicons-react";
import Link from "next/link";
import styles from "./shell.module.css";

/** Opens the Hallway chat; the post-onboarding agent lands in a later PR. */
export function ChatButton() {
  return (
    <Link href="/?chat=1" className={styles.chat} aria-label="Ask Hallway">
      <CommentDiscussionIcon size={24} />
    </Link>
  );
}
