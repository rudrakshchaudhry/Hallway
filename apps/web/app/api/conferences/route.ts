import { getGraph, listConferences } from "@hallway/graph";
import { ConferencesResponse } from "@hallway/types";

export async function GET() {
  return Response.json(ConferencesResponse.parse({ conferences: await listConferences(await getGraph()) }));
}
