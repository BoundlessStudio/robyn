import { authorizationMetadata, oauthFailure, oauthJson } from "@/studio/mcp/oauth";

export function GET() {
  try { return oauthJson(authorizationMetadata()); }
  catch (error) { return oauthFailure(error); }
}
