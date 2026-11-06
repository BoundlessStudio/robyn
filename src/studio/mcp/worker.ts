import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRevisionPackage } from "@/studio/assets";
import { preparePackageTransfers, readSavedPackage } from "@/studio/package-store";
import { dbFailure, id, ownedRevision, readMetadataBody, revisionFiles, verifyStoredFiles } from "@/studio/server";
import { mcpConfig, workerToken } from "./config";
import { readAssetRef } from "./library";
import { operationFailure, type DirectOperation } from "./operations";
import { craftWorkerResult } from "./schemas";

const rejected = () => new ApiError(401, "worker_denied", "This direct operation credential is unavailable.");

export async function workerCall(request: Request) {
  const { issuer } = mcpConfig();
  const origin = request.headers.get("origin");
  if (origin && origin !== issuer) throw new ApiError(403, "origin_mismatch", "Invalid workstation origin.");
  const token = /^Bearer (rbw_[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw rejected();
  const operationId = id(new URL(request.url).searchParams.get("operation"), "operation ID");
  const db = createAdminClient();
  const { data: binding, error: bindingError } = await db.from("studio_mcp_operations").select("instance_id,dispatched_at")
    .eq("id", operationId).maybeSingle();
  dbFailure(bindingError);
  if (!binding?.dispatched_at || !timingSafeEqual(Buffer.from(token), Buffer.from(workerToken(operationId, binding.instance_id)))) throw rejected();

  const input = await readMetadataBody(request, 2 * 1024 * 1024);
  if (input.jsonrpc !== "2.0" || typeof input.id !== "string" || input.method !== "tools/call"
    || !input.params || typeof input.params !== "object" || Array.isArray(input.params)) {
    throw new ApiError(400, "invalid_request", "Send a workstation tool call.");
  }
  const params = input.params as { name?: unknown; arguments?: unknown };
  const args = params.arguments as Record<string, unknown>;
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new ApiError(400, "invalid_request", "Send workstation tool arguments.");
  try {
    const value = await call(params.name, args);
    return { jsonrpc: "2.0", id: input.id, result: { structuredContent: value, content: [] } };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const value = { error: { code: error.code, message: error.message } };
    return { jsonrpc: "2.0", id: input.id, result: { structuredContent: value, content: [], isError: true } };
  }

  async function call(name: unknown, args: Record<string, unknown>) {
    if (name === "studio_finish_direct") {
      const parsed = craftWorkerResult.safeParse(args);
      if (!parsed.success) throw new ApiError(400, "invalid_receipt", "Invalid Craft operation receipt.");
      const { data, error } = await db.rpc("finish_studio_mcp_operation", { p_operation: operationId, p_result: parsed.data });
      dbFailure(error);
      if (!data) throw rejected();
      return { recorded: true };
    }
    if (name === "studio_begin_direct") {
      const { data, error } = await db.rpc("claim_studio_mcp_worker", { p_operation: operationId });
      dbFailure(error);
      return { claimed: data === true };
    }
    const { data, error } = await db.rpc("studio_mcp_worker_scope", { p_operation: operationId });
    dbFailure(error);
    if (!data) throw rejected();
    const op = data as DirectOperation;
    if (!op.worker_started_at) throw rejected();
    const { workspace_id: workspaceId, project_id: projectId } = op;
    if (name === "studio_context") return { assignmentId: op.id, appId: op.app_id, kind: "direct", inputs: op.inputs };
    if (name === "studio_open_asset") {
      const ref = { assetId: id(args.assetId, "asset ID"), revisionId: id(args.revisionId, "revision ID") };
      if (!op.inputs.some(input => input.assetId === ref.assetId && input.revisionId === ref.revisionId)
        && !(op.save_asset_id === ref.assetId && op.save_revision_id === ref.revisionId)) {
        throw new ApiError(404, "not_found", "This exact revision is outside the direct operation.");
      }
      const { asset } = await readAssetRef({ db, workspaceId }, projectId, ref);
      return { ...await readSavedPackage(db, workspaceId, ref.revisionId), appId: asset.asset_kind === "native" ? asset.app_id : null };
    }
    if (name === "studio_prepare_save") {
      if (!op.save_spec) throw new ApiError(403, "save_denied", "This operation has no authorized library save.");
      let pkg;
      try { pkg = validateRevisionPackage(args.package); }
      catch (error) { throw new ApiError(400, "invalid_package", (error as Error).message); }
      // Dependencies may include links retained from the selected base. The
      // library function verifies each one belongs to the owner's workspace.
      const { data, error } = await db.rpc("prepare_studio_mcp_save", { p_operation: op.id, p_package: pkg });
      operationFailure(error);
      return data;
    }
    if (name === "studio_upload_transfers" || name === "studio_commit_revision") {
      const revisionId = id(args.revisionId, "revision ID");
      if (revisionId !== op.save_revision_id) throw new ApiError(404, "not_found", "Revision not found in this operation.");
      if (name === "studio_upload_transfers") return { ...await preparePackageTransfers(db, workspaceId, revisionId), publicApiKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
      const revision = await ownedRevision(db, workspaceId, revisionId);
      const verified = ["committed", "conflict"].includes(revision.state) ? [] : await verifyStoredFiles(db, await revisionFiles(db, workspaceId, revisionId));
      const { data, error } = await db.rpc("commit_studio_mcp_save", { p_operation: op.id, p_revision: revisionId, p_verified: verified });
      dbFailure(error);
      return data;
    }
    throw new ApiError(400, "unknown_tool", "Unknown direct operation tool.");
  }
}
