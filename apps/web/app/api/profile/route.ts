import { SaveProfileRequest, SaveProfileResponse } from "@hallway/types";
import { saveProfile } from "@/lib/profile";

/** Save the confirmed onboarding profile and sign the user in (docs/ARCHITECTURE.md#onboarding). */
export async function POST(req: Request) {
  const body = SaveProfileRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message }, { status: 400 });
  const result = await saveProfile(body.data);
  if ("error" in result) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(SaveProfileResponse.parse(result));
}

