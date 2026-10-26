import { InviteResponse } from "@/components/tabs/InviteResponse";
import styles from "@/components/tabs/tabs.module.css";

/** Public invite page (docs/ARCHITECTURE.md#invites): works without onboarding; shows only who, why and when. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className={styles.page}>
      <p className={styles.kicker}>Hallway invite</p>
      <InviteResponse token={token} />
    </main>
  );
}
