import { ApiError } from "@/lib/api-error";
import { dbFailure, id, requireStudio } from "@/studio/server";
import { hasSameOrigin } from "@/lib/request-origin";
import { isMailConnectionId } from "@/studio/connected-mail";
import { mcpConfig } from "@/studio/mcp/config";
import { activeMcpMailboxes, changeMcpMailboxAccess, describeMcpMailbox, type McpMailboxRow } from "@/studio/mcp/mailboxes";
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
      const { data, error } = await db.from("studio_mcp_grants")
        .select("id,created_at,client:studio_mcp_clients!inner(name),mailboxAccess:studio_mcp_mailboxes(connection_id,instance_id,provider)")
        .eq("workspace_id", workspaceId).eq("user_id", user.id).is("revoked_at", null)
        .gt("refresh_expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
      dbFailure(error);
      const connections = data ?? [];
      if (!connections.length) return oauthJson({ connections, mailboxes: [], mailboxesUnavailable: false });
      const active = await activeMcpMailboxes(db, workspaceId).catch(() => null);
      const available = active?.mailboxes ?? [];
      return oauthJson({
        connections: connections.map(({ mailboxAccess, ...connection }) => ({
          ...connection,
          mailboxes: (mailboxAccess as McpMailboxRow[]).map(row => ({
            ...describeMcpMailbox(row.connection_id, row.provider),
            active: row.instance_id === active?.instanceId
              && available.some(item => item.id === row.connection_id && item.provider === row.provider),
          })),
        })),
        mailboxes: available.map(connection => describeMcpMailbox(connection.id, connection.provider)),
        mailboxesUnavailable: active === null,
      });
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
      case "mailbox":
      case "disconnect": {
        if (!hasSameOrigin(request)) return oauthJson({ error: "invalid_request", error_description: "Submit this form from Robyn." }, 403);
        const fields = await readOAuthForm(request);
        const { db, user, workspaceId } = await requireStudio();
        if (action === "authorize") return await decideAuthorization(db, user.id, workspaceId, fields);
        const grantId = id(fields.get("connection"), "connection ID");
        if (action === "mailbox") {
          const connectionId = fields.get("mailConnectionId");
          const decision = fields.get("decision");
          if (!isMailConnectionId(connectionId) || (decision !== "allow" && decision !== "remove")) {
            throw new ApiError(400, "invalid_mailbox_access", "Choose a mailbox and whether to allow or remove read access.");
          }
          await changeMcpMailboxAccess({ db, workspaceId, userId: user.id, grantId }, connectionId, decision === "allow");
        } else {
          const { error } = await db.from("studio_mcp_grants").update({ revoked_at: new Date().toISOString() })
            .eq("workspace_id", workspaceId).eq("user_id", user.id).eq("id", grantId);
          dbFailure(error);
        }
        return new Response(null, { status: 303, headers: { Location: "/oauth/connections", "Cache-Control": "no-store" } });
      }
      default: return oauthJson({ error: "not_found" }, 404);
    }
  } catch (error) { return oauthFailure(error); }
}
