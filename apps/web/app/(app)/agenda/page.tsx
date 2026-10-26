import { agendaFor } from "@hallway/graph/queries/agenda";
import { pastGraph } from "@hallway/graph/queries/feed";
import Link from "next/link";
import { Suspense } from "react";
import { Agenda } from "@/components/tabs/Agenda";
import styles from "@/components/tabs/tabs.module.css";
import { context } from "@/lib/context";
import { accessTokenFor, googleConfigured, pastEvents, readSession, type CalendarEvent } from "@/lib/google";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const { graph, me, conference } = await context();
  if (!conference) {
    return (
      <main className={styles.page}>
        <p className={styles.empty}>
          No conference yet. <Link href="/?chat=1">Start in the chat</Link>.
        </p>
      </main>
    );
  }
  const [items, past] = await Promise.all([agendaFor(graph, me, conference), pastGraph(graph, me)]);
  // Past events from Google Calendar, when signed in.
  let googlePast: CalendarEvent[] | null = null;
  const session = googleConfigured() ? await readSession() : null;
  if (session) {
    try {
      googlePast = await pastEvents(await accessTokenFor(session.refreshToken));
    } catch {
      googlePast = null;
    }
  }
  return (
    <main className={styles.page}>
      <div>
        <p className={styles.kicker}>{conference.name}</p>
        <h1 className={styles.title}>Agenda</h1>
      </div>
      <Suspense>
        <Agenda items={items} tz={conference.tz} past={past} googlePast={googlePast} />
      </Suspense>
    </main>
  );
}
