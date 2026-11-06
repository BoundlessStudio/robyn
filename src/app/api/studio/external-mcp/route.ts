import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpConfig } from "@/studio/mcp/config";
import { challenge, mcpIdentity, oauthFailure } from "@/studio/mcp/oauth";
import { createMcpServer } from "@/studio/mcp/tools";

export const maxDuration = 300;

async function handle(request: Request) {
  try {
    const { issuer } = mcpConfig();
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== issuer) return new Response(null, { status: 403 });
    const authorization = request.headers.get("authorization");
    const identity = await mcpIdentity(authorization);
    if (!identity) return new Response(null, { status: 401, headers: {
      "WWW-Authenticate": challenge(authorization !== null), "Cache-Control": "no-store",
    } });
    // Requests are independent. Clients poll persisted operations with tools,
    // so this endpoint has no long-lived HTTP sessions or unsolicited SSE.
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
    const server = createMcpServer(identity);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true, maxRequestBodySize: 262144 });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await server.close();
    }
  } catch (error) { return oauthFailure(error); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
