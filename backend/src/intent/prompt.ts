/**
 * Fixed prompt for the sentence the user types on the first step.
 *
 * The first screen collects the conference, the dates, and this sentence.
 * It does not ask about sponsorship. This prompt must not decide sponsorship.
 * If the returned reason is "job", backend/src/intent/follow-up.ts asks next.
 * If the reason is "talks" or "meet", that follow-up never runs.
 *
 * The model may return only IntentResult. topics must be copied from the
 * topic list we pass in. A topic that is not in that list is dropped before save.
 * reason "unsure" is not stored. The sentence box stays open.
 *
 * Saved on the ATTENDED edge as intent (raw text), reason, and summary.
 * Topics become INTERESTED_IN edges to Topic nodes that already exist.
 */

export type Reason = "talks" | "meet" | "job" | "unsure";

export type IntentResult = {
  reason: Reason;
  topics: string[];
  summary: string;
};

export function buildIntentPrompt(input: {
  eventName: string;
  topicNames: string[];
  githubHints: string[];
  userText: string;
}): string {
  return `You are classifying one conference visit. Return JSON only.
Do not add sessions, people, or companies. Do not explain.
Do not decide sponsorship. A later screen asks that, and only if the reason is job.

Conference: ${input.eventName}
Topics that exist at this conference: ${input.topicNames.join(", ")}
GitHub hints, if any: ${input.githubHints.join(", ")}

The user wrote:
"""
${input.userText}
"""

Pick one reason:
- talks: they are here for sessions
- meet: they are here to meet people
- job: they are here for a job, hiring, or recruiting
- unsure: the text does not say

If two reasons are present, pick the one the text emphasizes. If neither is emphasized, return unsure.

Return:
{"reason":"talks|meet|job|unsure","topics":[],"summary":"one line in their words"}`;
}
