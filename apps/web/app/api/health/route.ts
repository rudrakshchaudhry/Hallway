import { HealthResponse } from "@hallway/types";

export function GET() {
  return Response.json(HealthResponse.parse({ ok: true, time: new Date().toISOString() }));
}
