import { getGraph, getProfileSummary } from "@hallway/graph";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Chat } from "@/components/chat/Chat";
import { IDENTITY_COOKIE, verifyIdentity } from "@/lib/identity";

// "/" is the chat. Not signed in → onboarding. Signed in → feed, unless the chat button opened it
// (?chat=1 → the Hallway agent) or the user chose to redo onboarding (?chat=onboarding).
export default async function Home({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  const me = verifyIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
  if (!me || chat === "onboarding") return <Chat key="onboarding" />;
  if (!chat) redirect("/feed");
  const profile = await getProfileSummary(await getGraph(), me);
  return <Chat key="agent" mode="agent" name={profile?.name ?? undefined} />;
}
