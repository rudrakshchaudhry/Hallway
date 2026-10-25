import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const AGENT_COOKIE = "hallway_agent";

export async function agentChatId() {
  const jar = await cookies();
  let id = jar.get(AGENT_COOKIE)?.value;
  if (!id) {
    id = randomBytes(16).toString("hex");
    jar.set(AGENT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  }
  return id;
}
