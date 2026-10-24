/**
 * Calendar section, top of Today.
 *
 * Read CalendarBlock nodes for this userId and this day, ordered by start.
 * Include source "google" (synced from the user's calendar) and source
 * "connection" (someone accepted a message and picked a free gap).
 * Include source "plan" only when the user tapped Add on a suggestion.
 *
 * Adding a suggestion writes a plan block in our graph. It does not write
 * to Google Calendar. An accepted message is the write that puts another
 * person on this calendar. A draft, a pending message, or a decline does not.
 *
 * Gaps are the times with no block. Network proposes one of those gaps.
 * The accepted slot must not overlap an existing block.
 */

export type CalendarSource = "google" | "connection" | "plan";

export type CalendarBlock = {
  id: string;
  title: string;
  start: string;
  end: string;
  day: string;
  source: CalendarSource;
};
