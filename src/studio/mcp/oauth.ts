import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api-error";
import type { DB } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbFailure, readMetadataBody } from "@/studio/server";
import { hash, mcpConfig, opaque, oauthPath, resourceMetadataPath, scope, tokenPart } from "./config";

const methods = ["none", "client_secret_basic", "client_secret_post"] as const;
type AuthMethod = (typeof methods)[number];
type Client = { id: string; name: string; redirect_uris: string[]; auth_method: AuthMethod; secret_hash: string | null };
export type McpIdentity = { db: DB; userId: string; workspaceId: string; grantId: string };
const pkceVerifier = /^[A-Za-z0-9._~-]{43,128}$/;
const clientIdPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

class OAuthError extends ApiError {}
const invalid = (message: string) => new OAuthError(400, "invalid_request", message);
const invalidClient = () => new OAuthError(401, "invalid_client", "The OAuth client credentials are invalid.");
const invalidGrant = () => new OAuthError(400, "invalid_grant", "This authorization grant is invalid or expired. Reconnect to Robyn.");

export function oauthJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: noStore });
}

export function oauthFailure(error: unknown) {
  if (error instanceof ApiError && error.status < 500) {
    return Response.json({ error: error.code, error_description: error.message }, {
      status: error.status,
      headers: { ...noStore, ...(error.status === 401 ? { "WWW-Authenticate": 'Basic realm="Robyn OAuth"' } : {}) },
    });
  }
  return oauthJson({ error: "temporarily_unavailable", error_description: "Robyn authorization is unavailable. Please retry." }, 503);
}

export function authorizationMetadata() {
  const { issuer } = mcpConfig();
  return {
    issuer,
    authorization_endpoint: issuer + "/oauth/authorize",
    token_endpoint: issuer + oauthPath + "/token",
    registration_endpoint: issuer + oauthPath + "/register",
    revocation_endpoint: issuer + oauthPath + "/revoke",
    authorization_response_iss_parameter_supported: true,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: methods,
    revocation_endpoint_auth_methods_supported: methods,
    scopes_supported: [scope],
  };
}

export function resourceMetadata() {
  const { resource, issuer } = mcpConfig();
  return { resource, authorization_servers: [issuer], bearer_methods_supported: ["header"], scopes_supported: [scope], resource_name: "Robyn" };
}

export function challenge(invalidToken = false) {
  const { issuer } = mcpConfig();
  return `Bearer resource_metadata="${issuer}${resourceMetadataPath}/mcp", scope="${scope}"${invalidToken ? ', error="invalid_token", error_description="Connect your invited Robyn account."' : ""}`;
}

function checkedResource(value: string | null) {
  const { resource } = mcpConfig();
  if (value !== null && value !== resource) throw new OAuthError(400, "invalid_target", "Choose the Robyn MCP resource advertised by this server.");
  return resource;
}

function redirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\#]/.test(value)) return false;
  try {
    const url = new URL(value);
    const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return value === url.href && !url.username && !url.password && (url.protocol === "https:" || loopback);
  } catch { return false; }
}

function supportedList(value: unknown, allowed: string[], required: string) {
  return Array.isArray(value) && value.includes(required) && value.length <= allowed.length
    && new Set(value).size === value.length && value.every(item => allowed.includes(item));
}

export async function registerClient(request: Request) {
  mcpConfig();
  const input = await readMetadataBody(request, 16384);
  const method = input.token_endpoint_auth_method ?? "client_secret_basic";
  if (!methods.includes(method as AuthMethod)) throw new OAuthError(400, "invalid_client_metadata", "Choose a supported token authentication method.");
  const redirectUris = input.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length < 1 || redirectUris.length > 8 || !redirectUris.every(redirectUri)) {
    throw new OAuthError(400, "invalid_redirect_uri", "Register exact HTTPS or loopback callback URLs.");
  }
  const grants = input.grant_types ?? ["authorization_code"];
  const responses = input.response_types ?? ["code"];
  if (!supportedList(grants, ["authorization_code", "refresh_token"], "authorization_code")
    || !supportedList(responses, ["code"], "code") || (input.scope !== undefined && input.scope !== scope)) {
    throw new OAuthError(400, "invalid_client_metadata", "Robyn uses the authorization-code flow with S256 PKCE.");
  }
  const name = typeof input.client_name === "string" ? input.client_name.trim() : "MCP client";
  if (!name || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new OAuthError(400, "invalid_client_metadata", "Use a short display name.");
  const secret = method === "none" ? null : opaque();
  const db = createAdminClient();
  const { data, error } = await db.rpc("register_studio_mcp_client", {
    p_name: name, p_redirects: [...new Set<string>(redirectUris)].sort(), p_method: method, p_secret_hash: secret && hash(secret),
  });
  if (error?.message.includes("registration rate limit")) throw new OAuthError(429, "temporarily_unavailable", "Wait a minute before registering another connection.");
  dbFailure(error);
  return oauthJson({
    client_id: data, client_name: name, redirect_uris: redirectUris, token_endpoint_auth_method: method,
    grant_types: grants, response_types: responses, scope,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  }, 201);
}

async function getClient(db: DB, id: string | null) {
  if (!id || !clientIdPattern.test(id)) throw invalidClient();
  const { data, error } = await db.from("studio_mcp_clients").select("id,name,redirect_uris,auth_method,secret_hash").eq("id", id).maybeSingle();
  dbFailure(error);
  if (!data) throw invalidClient();
  return data as Client;
}

export function oauthFields(params: URLSearchParams) {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) throw invalid("OAuth parameters must appear once.");
    seen.add(key);
  }
  return params;
}

export async function readOAuthForm(request: Request, limit = 16384) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    throw invalid("Send a URL-encoded OAuth form.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw invalid("Send an OAuth form.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw invalid("The OAuth form is too large.");
    }
    chunks.push(value);
  }
  return oauthFields(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

export async function authorizationRequest(db: DB, fields: URLSearchParams) {
  const client = await getClient(db, fields.get("client_id"));
  const redirect = fields.get("redirect_uri");
  if (!redirect || !client.redirect_uris.includes(redirect)) throw invalid("The callback does not match this OAuth client.");
  const state = fields.get("state");
  if (state && state.length > 2048) throw invalid("The OAuth state is too large.");
  const resource = checkedResource(fields.get("resource"));
  if (fields.get("response_type") !== "code") throw new OAuthError(400, "unsupported_response_type", "Robyn requires an authorization code.");
  if ((fields.get("scope") ?? scope).trim() !== scope) throw new OAuthError(400, "invalid_scope", "The requested permission is unavailable.");
  const verifier = fields.get("code_challenge");
  if (fields.get("code_challenge_method") !== "S256" || !verifier || !tokenPart.test(verifier)) throw invalid("Robyn requires an S256 PKCE challenge.");
  return { clientId: client.id, clientName: client.name, redirect, state, resource, verifier };
}

export async function decideAuthorization(db: DB, userId: string, workspaceId: string, fields: URLSearchParams) {
  const auth = await authorizationRequest(db, fields);
  const callback = new URL(auth.redirect);
  callback.searchParams.set("iss", mcpConfig().issuer);
  if (auth.state !== null) callback.searchParams.set("state", auth.state);
  if (fields.get("decision") === "allow") {
    const code = opaque();
    const { error } = await db.from("studio_mcp_codes").insert({
      code_hash: hash(code), client_id: auth.clientId, user_id: userId, workspace_id: workspaceId,
      redirect_uri: auth.redirect, challenge: auth.verifier, resource: auth.resource,
    });
    dbFailure(error);
    callback.searchParams.set("code", code);
  } else if (fields.get("decision") === "deny") {
    callback.searchParams.set("error", "access_denied");
  } else throw invalid("Choose whether to connect Robyn.");
  return new Response(null, { status: 303, headers: { ...noStore, Location: callback.href, "Referrer-Policy": "no-referrer" } });
}

async function authenticateClient(db: DB, request: Request, fields: URLSearchParams) {
  let clientId = fields.get("client_id");
  let secret = fields.get("client_secret");
  let method = secret === null ? "none" : "client_secret_post";
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const basic = /^Basic ([A-Za-z0-9+/=]{1,512})$/i.exec(authorization);
    if (!basic || clientId !== null || secret !== null) throw invalidClient();
    const decoded = Buffer.from(basic[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) throw invalidClient();
    try {
      clientId = decodeURIComponent(decoded.slice(0, separator).replaceAll("+", " "));
      secret = decodeURIComponent(decoded.slice(separator + 1).replaceAll("+", " "));
    } catch { throw invalidClient(); }
    method = "client_secret_basic";
  }
  const client = await getClient(db, clientId);
  if (method !== client.auth_method || (method !== "none" && (!secret || !client.secret_hash
    || !timingSafeEqual(Buffer.from(hash(secret), "hex"), Buffer.from(client.secret_hash, "hex"))))) throw invalidClient();
  return client;
}

export async function exchangeToken(request: Request) {
  mcpConfig();
  const fields = await readOAuthForm(request);
  const resource = checkedResource(fields.get("resource"));
  const db = createAdminClient();
  const client = await authenticateClient(db, request, fields);
  const accessToken = "rbm_" + opaque();
  const refreshToken = "rbr_" + opaque();
  let exchanged;
  if (fields.get("grant_type") === "authorization_code") {
    const code = fields.get("code");
    const verifier = fields.get("code_verifier");
    const redirect = fields.get("redirect_uri");
    if (!code || !tokenPart.test(code) || !verifier || !pkceVerifier.test(verifier) || !redirect || !client.redirect_uris.includes(redirect)) throw invalidGrant();
    exchanged = await db.rpc("exchange_studio_mcp_code", {
      p_code_hash: hash(code), p_client: client.id, p_redirect: redirect,
      p_challenge: createHash("sha256").update(verifier).digest("base64url"), p_resource: resource,
      p_access_hash: hash(accessToken), p_refresh_hash: hash(refreshToken),
    });
  } else if (fields.get("grant_type") === "refresh_token") {
    const refresh = fields.get("refresh_token");
    if (!refresh || !/^rbr_[A-Za-z0-9_-]{43}$/.test(refresh)) throw invalidGrant();
    if ((fields.get("scope") ?? scope).trim() !== scope) throw new OAuthError(400, "invalid_scope", "Reconnect to change the requested permission.");
    exchanged = await db.rpc("refresh_studio_mcp_grant", {
      p_refresh_hash: hash(refresh), p_client: client.id, p_resource: resource,
      p_new_access: hash(accessToken), p_new_refresh: hash(refreshToken),
    });
  } else throw new OAuthError(400, "unsupported_grant_type", "Use an authorization code or a refresh token.");
  dbFailure(exchanged.error);
  if (exchanged.data !== true) throw invalidGrant();
  return oauthJson({ access_token: accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: refreshToken, scope });
}

export async function revokeToken(request: Request) {
  const { resource } = mcpConfig();
  const fields = await readOAuthForm(request);
  const db = createAdminClient();
  const client = await authenticateClient(db, request, fields);
  const token = fields.get("token");
  if (!token) throw invalid("Send the token to revoke.");
  if (/^rb[mr]_[A-Za-z0-9_-]{43}$/.test(token)) {
    const { error } = await db.from("studio_mcp_grants").update({ revoked_at: new Date().toISOString() })
      .eq("client_id", client.id).eq("resource", resource).eq(token.startsWith("rbm_") ? "access_hash" : "refresh_hash", hash(token));
    dbFailure(error);
  }
  return new Response(null, { status: 200, headers: noStore });
}

export async function mcpIdentity(authorization: string | null): Promise<McpIdentity | null> {
  const token = /^Bearer (rbm_[A-Za-z0-9_-]{43})$/i.exec(authorization ?? "")?.[1];
  if (!token) return null;
  const db = createAdminClient();
  const { data, error } = await db.rpc("studio_mcp_identity", { p_access_hash: hash(token), p_resource: mcpConfig().resource });
  dbFailure(error);
  return data ? { db, ...data } : null;
}
