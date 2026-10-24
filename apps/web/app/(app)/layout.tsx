import type { ReactNode } from "react";
import { ChatButton } from "@/components/shell/ChatButton";
import { TabBar } from "@/components/shell/TabBar";
import styles from "@/components/shell/shell.module.css";

// Main owns this layout; Track A and B own the pages inside it (PLAN.md section 8).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.content}>{children}</div>
      <ChatButton />
      <TabBar />
    </>
  );
}
