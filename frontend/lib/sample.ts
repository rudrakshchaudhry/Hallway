/**
 * Sample Today feed.
 *
 * These cards stand in until frontend calls backend/src/today/feed.ts.
 * The sample reason is "talks", so this list has no job events and no
 * sponsor companies. Those appear only after the prompt returns "job",
 * and sponsor companies only after the follow-up screen says yes.
 * That follow-up is frontend/app/follow-up/page.tsx and is not linked here.
 */

export type CalendarSource = "google" | "connection" | "plan";

export type CalendarBlock = {
  id: string;
  time: string;
  title: string;
  detail: string;
  source: CalendarSource;
};

export type Suggestion = {
  id: string;
  time: string;
  verdict: string;
  reason: string;
  place: string;
  kind: "talk" | "nearby";
};

export type PersonCard = {
  id: string;
  name: string;
  role: string;
  shared: string;
  where: string;
};

export const sampleSummary = "Talks · platforms";

export const calendar: CalendarBlock[] = [
  {
    id: "land",
    time: "09:00",
    title: "Land at SFO",
    detail: "Already on Google Calendar",
    source: "google",
  },
  {
    id: "priya-met",
    time: "18:00",
    title: "Meet Priya",
    detail: "She accepted 6:00–6:20",
    source: "connection",
  },
];

export const suggestions: Suggestion[] = [
  {
    id: "platform",
    time: "10:30",
    verdict: "Platforms keynote",
    reason: "Matches the topic you kept",
    place: "Room 201",
    kind: "talk",
  },
  {
    id: "nearby",
    time: "19:30",
    verdict: "Git-Together",
    reason: "Public event in the city tonight",
    place: "Fort Mason",
    kind: "nearby",
  },
];

export const people: PersonCard[] = [
  {
    id: "priya",
    name: "Priya Shah",
    role: "Maintains a library four of your repos use",
    shared: "platforms",
    where: "Room 201 after 10:30",
  },
  {
    id: "jordan",
    name: "Jordan Lee",
    role: "Speaking on the track you marked",
    shared: "platforms",
    where: "Hall B at 14:00",
  },
];

export function draftFor(person: PersonCard): string {
  return `Hi ${person.name.split(" ")[0]} — I'm at the conference for ${person.shared}. I'll be free at 16:40 for 20 minutes. Open to saying hello?`;
}
