import type { ReactNode } from "react";
import { ChatButton } from "@/components/shell/ChatButton";
import { TabBar } from "@/components/shell/TabBar";
import styles from "@/components/shell/shell.module.css";

// The tab shell: page content, the floating chat button and the bottom tab bar.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.content}>{children}</div>
      <ChatButton />
      <TabBar />
    </>
  );
}
