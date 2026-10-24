import { StagePathResponse } from "@hallway/types";

// Stage view is first on the cut list; this keeps demo:check honest until it lands.
export function GET() {
  return Response.json(StagePathResponse.parse({ path: null, at: null }));
}
