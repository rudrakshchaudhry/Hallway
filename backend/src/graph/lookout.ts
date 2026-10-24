/**
 * Master graph lookout. One FalkorDB database. Check it before any scrape.
 *
 * For one userId and one day, in order:
 * 1. The Person with this userId. Sign-in creates it. The client does not pick the id.
 * 2. CalendarBlocks for that day. Empty means Today shows a connect action.
 * 3. The Event, by official URL, then slug, then name plus the user's dates.
 *    A miss scrapes the official site and MERGEs event, talks, published people, expo.
 *    A hit within 12 hours does not scrape. Older than that, serve the graph and refresh behind.
 * 4. The ATTENDED edge. Missing means store their sentence, run the fixed prompt,
 *    and save reason, summary, and topics. Unsure does not build Today.
 *    Sponsorship is not set here. If reason is job, the follow-up screen sets it.
 * 5. Suggestion nodes allowed for that reason. See today/events.ts.
 * 6. People who share a topic and are not already connected. See today/network.ts.
 * 7. Public nearby events for the city and the dates. Miss can refresh Luma and
 *    public sponsor pages. Store hosts named on the page, not a guest list.
 *
 * MERGE on Event.slug. Loading one conference does not delete another.
 * Schema, keys, and the accept-message write are in docs/DATABASE.md.
 */
export {};
