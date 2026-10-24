import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Chat } from "@/components/chat/Chat";
import { IDENTITY_COOKIE, verifyIdentity } from "@/lib/identity";

// Onboarding chat. Signed-in users go to their feed unless they open the chat on purpose (?chat=1).
export default async function Home({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  if (!chat && verifyIdentity((await cookies()).get(IDENTITY_COOKIE)?.value)) redirect("/feed");
  return <Chat />;
}
