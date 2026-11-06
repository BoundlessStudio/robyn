import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api-error";

export const mcpPath = "/mcp";
export const scope = "studio:mcp";
export const resourceMetadataPath = "/.well-known/oauth-protected-resource";
export const oauthPath = "/api/studio/mcp-oauth";
export const workerPath = "/api/studio/mcp-runtime";
export const tokenPart = /^[A-Za-z0-9_-]{43}$/;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const opaque = () => randomBytes(32).toString("base64url");

export function mcpConfig() {
  const secret = process.env.ROBYN_MCP_RUNTIME_SECRET;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !tokenPart.test(secret) || !site) {
    throw new ApiError(503, "mcp_unavailable", "The Robyn MCP connection is unavailable.");
  }
  const issuer = new URL(site).origin;
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(issuer) && !process.env.VERCEL;
  if (!issuer.startsWith("https://") && !local) throw new ApiError(503, "mcp_unavailable", "Robyn MCP requires HTTPS.");
  return { issuer, resource: issuer + mcpPath };
}

export function workerToken(operationId: string, instanceId: string) {
  const { resource } = mcpConfig();
  return "rbw_" + createHmac("sha256", Buffer.from(process.env.ROBYN_MCP_RUNTIME_SECRET!, "base64url"))
    .update(JSON.stringify([resource, operationId, instanceId])).digest("base64url");
}
