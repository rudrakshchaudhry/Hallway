/**
 * Sponsorship follow-up.
 *
 * Not part of the first screen and not part of the fixed prompt.
 * Run this only after IntentResult.reason is "job".
 * The screen asks one yes or no: do they want a company to sponsor them?
 *
 * Yes stores ATTENDED.sponsorship = true and My events may include sponsor companies.
 * No stores ATTENDED.sponsorship = false. Job-event suggestions still show.
 * talks and meet never call this, and ATTENDED.sponsorship stays unset.
 */

export type SponsorshipAnswer = "yes" | "no";

export function applySponsorship(answer: SponsorshipAnswer): boolean {
  return answer === "yes";
}
