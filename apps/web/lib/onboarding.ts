import "./env";
import { getGraph, getProfileSummary, listConferences, listTopics } from "@hallway/graph";
import { GoalId, type ChatEvent, type ProfileDraft } from "@hallway/types";
import { demoPersonId } from "./identity";
import { fetchGitHubProfile } from "./github";
import { extractProfile, parseIntent } from "./llm";
import { saveProfile } from "./profile";

// The onboarding chat as a deterministic step machine (PLAN.md 2.1). The LLM only reads
// free text; every step works with chips alone.
type Step = "conference" | "goals" | "identity" | "github" | "about" | "confirm" | "done";
type State = { step: Step; conferenceId?: string; conferenceName?: string; goals?: GoalId[]; topics?: string[]; draft?: ProfileDraft };

const sessions = new Map<string, State>();
type Emit = (event: ChatEvent) => void;

const GOAL_CHIPS = [
  { id: "goal:networking", label: "Networking" },
  { id: "goal:learn", label: "Learn a topic" },
  { id: "goal:job", label: "Find a job" },
  { id: "goal:hire", label: "Hire" },
  { id: "goal:collaborate", label: "Find collaborators" },
  { id: "goal:fundraise", label: "Fundraise" },
];
const IDENTITY_CHIPS = [
  { id: "id:github", label: "GitHub username" },
  { id: "id:about", label: "Tell you about myself" },
  { id: "id:demo", label: "Use demo profile" },
];

async function askConference(state: State, emit: Emit) {
  const conferences = (await listConferences(await getGraph())).filter((c) => c.conference.status === "ready" && c.counts.talks > 0);
  state.step = "conference";
  emit({ type: "text", delta: "Hi! I'm Hallway. Which conference are you focusing on?" });
  emit({ type: "chips", multi: false, chips: conferences.map((c) => ({ id: c.conference.id, label: c.conference.name })) });
  emit({ type: "input", accept: "text", placeholder: "Or type a conference name" });
}

function askGoals(state: State, emit: Emit) {
  state.step = "goals";
  emit({ type: "text", delta: `Great, ${state.conferenceName}. What do you want out of it? Pick any, or tell me in your own words.` });
  emit({ type: "chips", multi: true, chips: GOAL_CHIPS });
  emit({ type: "input", accept: "text", placeholder: "e.g. meet people building AI dev tools" });
}

function askIdentity(state: State, emit: Emit) {
  state.step = "identity";
  emit({ type: "text", delta: "Now, who are you? I'll read your public GitHub, or you can tell me about yourself." });
  emit({ type: "chips", multi: false, chips: IDENTITY_CHIPS });
}

function showDraft(state: State, draft: ProfileDraft, emit: Emit) {
  state.draft = draft;
  state.step = "confirm";
  emit({ type: "text", delta: "Here's what I've got. Does this look right?" });
  emit({ type: "profile_draft", draft });
  emit({ type: "chips", multi: false, chips: [{ id: "confirm:yes", label: "Looks good" }, { id: "confirm:edit", label: "Start over" }] });
}

async function topicNames(): Promise<string[]> {
  return (await listTopics(await getGraph())).map((t) => t.name);
}

async function demoDraft(): Promise<ProfileDraft> {
  const row = await getProfileSummary(await getGraph(), demoPersonId());
  return {
    name: row?.name ?? "Demo attendee",
    ...(row?.headline ? { headline: row.headline } : {}),
    skills: row?.skills ?? [],
    topics: row?.topics ?? [],
    companies: [],
    repos: row?.repos ?? [],
    packages: [],
    sources: ["demo"],
  };
}

/** Advances the conversation by one user turn, emitting chat events. */
export async function chatTurn(sessionId: string, input: { message: string; chipIds?: string[] }, emit: Emit) {
  const chips = input.chipIds ?? [];
  const message = input.message.trim();
  let state = sessions.get(sessionId);
  if (!state || chips.includes("restart") || chips.includes("confirm:edit")) {
    state = { step: "conference" };
    sessions.set(sessionId, state);
    return askConference(state, emit);
  }

  switch (state.step) {
    case "conference": {
      const chip = chips.find((c) => c.startsWith("conf:"));
      const conferences = (await listConferences(await getGraph())).map((c) => c.conference);
      const match = chip
        ? conferences.find((c) => c.id === chip)
        : conferences.find((c) => message && c.name.toLowerCase().includes(message.toLowerCase()));
      if (!match) {
        emit({ type: "text", delta: `I don't have "${message}" yet. Live ingest for new conferences is coming soon. For now, pick one I know.` });
        return askConference(state, emit);
      }
      state.conferenceId = match.id;
      state.conferenceName = match.name;
      return askGoals(state, emit);
    }
    case "goals": {
      if (message) {
        emit({ type: "step", id: "intent", tool: "intent", status: "running", summary: "Reading what you want…" });
        try {
          const intent = await parseIntent(message, state.conferenceName ?? "", await topicNames());
          state.goals = intent.goals.length ? intent.goals : ["networking"];
          state.topics = intent.topics;
          emit({ type: "step", id: "intent", tool: "intent", status: "done", summary: "Understood" });
          emit({ type: "intent", intent: { ...intent, goals: state.goals } });
        } catch (err) {
          console.error("intent parse failed", err);
          emit({ type: "step", id: "intent", tool: "intent", status: "error", summary: "Couldn't read that; pick from the chips" });
          return askGoals(state, emit);
        }
      } else {
        const goals = chips.map((c) => c.replace(/^goal:/, "")).filter((g): g is GoalId => GoalId.safeParse(g).success);
        if (!goals.length) return askGoals(state, emit);
        state.goals = goals;
      }
      return askIdentity(state, emit);
    }
    case "identity": {
      if (chips.includes("id:demo")) return showDraft(state, await demoDraft(), emit);
      if (chips.includes("id:github")) {
        state.step = "github";
        emit({ type: "text", delta: "What's your GitHub username?" });
        return emit({ type: "input", accept: "text", placeholder: "GitHub username" });
      }
      if (chips.includes("id:about")) {
        state.step = "about";
        emit({ type: "text", delta: "Tell me about yourself: what you do, where, and what you're into." });
        return emit({ type: "input", accept: "text", placeholder: "I'm a backend engineer at…" });
      }
      return askIdentity(state, emit);
    }
    case "github": {
      if (!/^[A-Za-z0-9-]{1,39}$/.test(message)) {
        emit({ type: "text", delta: "That doesn't look like a GitHub username. Try again?" });
        return emit({ type: "input", accept: "text", placeholder: "GitHub username" });
      }
      emit({ type: "step", id: "github", tool: "github", status: "running", summary: `Reading github.com/${message}…` });
      const draft = await fetchGitHubProfile(message, (summary) => emit({ type: "step", id: "github", tool: "github", status: "running", summary }));
      if (!draft) {
        emit({ type: "step", id: "github", tool: "github", status: "error", summary: "No public GitHub user by that name" });
        return askIdentity(state, emit);
      }
      emit({ type: "step", id: "github", tool: "github", status: "done", summary: "GitHub profile read" });
      return showDraft(state, { ...draft, topics: [...new Set([...(state.topics ?? []), ...draft.topics])] }, emit);
    }
    case "about": {
      if (message.length < 10) {
        emit({ type: "text", delta: "Tell me a little more, a sentence or two." });
        return emit({ type: "input", accept: "text", placeholder: "I'm a backend engineer at…" });
      }
      emit({ type: "step", id: "about", tool: "extract", status: "running", summary: "Building your profile…" });
      try {
        const draft = await extractProfile(message);
        emit({ type: "step", id: "about", tool: "extract", status: "done", summary: "Profile built" });
        return showDraft(state, { ...draft, topics: [...new Set([...(state.topics ?? []), ...draft.topics])] }, emit);
      } catch {
        emit({ type: "step", id: "about", tool: "extract", status: "error", summary: "Couldn't build a profile from that" });
        return askIdentity(state, emit);
      }
    }
    case "confirm": {
      if (!chips.includes("confirm:yes") || !state.draft || !state.conferenceId) return showDraft(state, state.draft ?? (await demoDraft()), emit);
      const saved = await saveProfile({ draft: state.draft, goals: state.goals ?? ["networking"], conferenceId: state.conferenceId });
      if ("error" in saved) return emit({ type: "error", message: saved.error });
      state.step = "done";
      emit({ type: "text", delta: "You're all set. Building your plan…" });
      return emit({ type: "redirect", to: "/feed" });
    }
    case "done":
      emit({ type: "text", delta: "You're set up. The chat agent for questions is coming soon." });
      return emit({ type: "redirect", to: "/feed" });
  }
}
