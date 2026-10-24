/**
 * Network section, under My events.
 *
 * Suggest a person who shares a topic with the user and is at this event.
 * They are a published speaker, host, or named sponsor, or an attendee who
 * opted in. Do not search LinkedIn for other people who might be attending.
 * The user's own LinkedIn URL is only the link they chose to put on a message.
 *
 * Message opens a draft. The draft names the shared topic and one free gap
 * from the calendar. Approve sets the connection to pending. Skip writes nothing.
 *
 * When the other person accepts and picks a gap:
 * - connection status becomes accepted, with slotStart and slotEnd
 * - one CalendarBlock is created, source "connection", titled Meet {name}
 * The calendar section reads that block, so Today shows the meeting
 * without a second copy of the day.
 *
 * History is not stored separately. It is past ATTENDED events and the
 * connections on them, for this same userId.
 */

export type ConnectionStatus = "draft" | "pending" | "accepted" | "declined";

export type NetworkSuggestion = {
  personKey: string;
  name: string;
  role: string;
  sharedTopic: string;
  where: string;
  status: ConnectionStatus;
};
