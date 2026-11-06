import { dbFailure, id, requireStudio } from "@/studio/server";
import { hasSameOrigin } from "@/lib/request-origin";
import { mcpConfig } from "@/studio/mcp/config";
import { authorizationRequest, decideAuthorization, exchangeToken, oauthFailure, oauthFields, oauthJson, readOAuthForm, registerClient, revokeToken } from "@/studio/mcp/oauth";

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    if (action === "consent") {
      mcpConfig();
      const { db, user } = await requireStudio();
      const consent = await authorizationRequest(db, oauthFields(new URL(request.url).searchParams));
      return oauthJson({ client: consent.clientName, host: new URL(consent.redirect).host, email: user.email });
    }
    if (action === "connections") {
      const { db, user, workspaceId } = await requireStudio();
      const { data, error } = await db.from("studio_mcp_grants").select("id,created_at,client:studio_mcp_clients!inner(name)")
        .eq("workspace_id", workspaceId).eq("user_id", user.id).is("revoked_at", null)
        .gt("refresh_expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
      dbFailure(error);
      return oauthJson({ connections: data ?? [] });
    }
    return oauthJson({ error: "not_found" }, 404);
  } catch (error) { return oauthFailure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    switch (action) {
      case "register": return await registerClient(request);
      case "token": return await exchangeToken(request);
      case "revoke": return await revokeToken(request);
      case "authorize":
      case "disconnect": {
        if (!hasSameOrigin(request)) return oauthJson({ error: "invalid_request", error_description: "Submit this form from Robyn." }, 403);
        const fields = await readOAuthForm(request);
        const { db, user, workspaceId } = await requireStudio();
        if (action === "authorize") return await decideAuthorization(db, user.id, workspaceId, fields);
        const { error } = await db.from("studio_mcp_grants").update({ revoked_at: new Date().toISOString() })
          .eq("workspace_id", workspaceId).eq("user_id", user.id).eq("id", id(fields.get("connection"), "connection ID"));
        dbFailure(error);
        return new Response(null, { status: 303, headers: { Location: "/oauth/connections", "Cache-Control": "no-store" } });
      }
      default: return oauthJson({ error: "not_found" }, 404);
    }
  } catch (error) { return oauthFailure(error); }
}
