/**
 * Today is one mobile feed with three sections, loaded in this order.
 *
 * 1. calendar.ts  — blocks already on the user's day
 * 2. events.ts    — suggestion boxes for what this conference would give them
 * 3. network.ts   — people who share a topic, and the message they may approve
 *
 * The frontend renders them as one scroll. It does not offer three modes.
 * Sample cards in the frontend stand in for this response until these loaders
 * read FalkorDB. The lookup order is backend/src/graph/lookout.ts.
 *
 * userId comes from the server session. The request does not get to choose it.
 */

import type { CalendarBlock } from "./calendar";
import type { EventSuggestion } from "./events";
import type { NetworkSuggestion } from "./network";

export type TodayFeed = {
  userId: string;
  day: string;
  summary: string;
  calendar: CalendarBlock[];
  events: EventSuggestion[];
  network: NetworkSuggestion[];
};
