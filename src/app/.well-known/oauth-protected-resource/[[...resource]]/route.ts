import { oauthFailure, oauthJson, resourceMetadata } from "@/studio/mcp/oauth";

export async function GET(_request: Request, { params }: { params: Promise<{ resource?: string[] }> }) {
  const path = (await params).resource ?? [];
  if (path.length && (path.length !== 1 || path[0] !== "mcp")) return oauthJson({ error: "not_found" }, 404);
  try { return oauthJson(resourceMetadata()); }
  catch (error) { return oauthFailure(error); }
}
