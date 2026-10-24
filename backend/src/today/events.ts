/**
 * My events section, under the calendar.
 *
 * These are suggestions for what the user would get, not events they have
 * already saved. Each card is a verdict, a reason, and Add.
 * Add creates a CalendarBlock with source "plan" when the time is free.
 *
 * Which cards are allowed:
 * - A talk whose topic is one the prompt kept. Always, once the agenda is stored.
 * - A public nearby event (Luma or a sponsor page): name, time, venue, hosts
 *   listed on that page. No guest list.
 * - A job event only when ATTENDED.reason is "job".
 * - A sponsor company only when reason is "job" and the follow-up answer is yes.
 *
 * Titles, rooms, and times come from stored nodes. A missing field stays empty.
 * If the conference is not in the graph, the official site is scraped once
 * and merged. A later user at the same event reuses those nodes.
 */

export type SuggestionKind = "talk" | "nearby" | "job" | "sponsor";

export type EventSuggestion = {
  id: string;
  kind: SuggestionKind;
  verdict: string;
  reason: string;
  start: string;
  end: string;
  place: string;
};
