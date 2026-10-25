import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerHallwayTools } from "@/lib/agent/tools";

// Hallway's MCP server for the TrueForge agent (stateless streamable HTTP). It is reachable
// through the tunnel, so every request must carry the shared MCP_HALLWAY_TOKEN.
function authorized(req: Request): boolean {
  const expected = process.env.MCP_HALLWAY_TOKEN;
  const given = req.headers.get("x-hallway-token") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const server = new McpServer({ name: "hallway", version: "1.0.0" });
  const origin = (process.env.PUBLIC_URL?.startsWith("https://") ? process.env.PUBLIC_URL : new URL(req.url).origin).replace(/\/$/, "");
  registerHallwayTools(server, origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
