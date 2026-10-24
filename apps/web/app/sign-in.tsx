import { Heading } from "@primer/react";
import { Nav } from "./nav";
import styles from "./page.module.css";

export function SignIn({ failed, current = "today" }: { failed?: boolean; current?: "today" | "events" }) {
  return (
    <main className={styles.main}>
      <p className={styles.kicker}>Hallway</p>
      <Heading as="h1">Sign in</Heading>
      <p className={styles.muted}>Today and My events both read your Google Calendar.</p>
      {failed ? <p className={styles.muted}>Google sign-in did not finish. Try again.</p> : null}
      <a className={styles.primary} href="/api/auth/google">
        Continue with Google
      </a>
      <Nav current={current} />
    </main>
  );
}
