import Link from "next/link";
import { People } from "@/components/tabs/People";
import styles from "@/components/tabs/tabs.module.css";
import { context } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { conference } = await context();
  return (
    <main className={styles.page}>
      <div>
        <p className={styles.kicker}>{conference?.name ?? "Hallway"}</p>
        <h1 className={styles.title}>Whom to meet</h1>
      </div>
      {conference ? (
        <People tz={conference.tz} />
      ) : (
        <p className={styles.empty}>
          No conference yet. <Link href="/?chat=1">Start in the chat</Link>.
        </p>
      )}
    </main>
  );
}
