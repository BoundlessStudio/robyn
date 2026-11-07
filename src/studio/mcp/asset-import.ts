import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api-error";
import { validateBridgePackage } from "@/studio/asset-bridge";
import { validatePackagePath, validateRevisionPackage } from "@/studio/assets";
import { preparePackageTransfers } from "@/studio/package-store";
import { dbFailure, ownedProject, ownedRevision, revisionFiles, STUDIO_BUCKET, textField, verifyStoredFiles } from "@/studio/server";
import { rasterImageExtension, sourceFormat, sourceImportFiles, validateSourcePackage } from "@/studio/source-import";
import type { LocalPackageFile } from "@/studio/transfer-client";
import { assertUploadAllowed } from "@/studio/upload-policy";
import { hash } from "./config";
import type { McpIdentity } from "./oauth";

export const attachmentLimit = 20;
const totalLimit = 32 * 1024 ** 2;
const neutralMime = "application/octet-stream";
type Attachment = { download_url: string; file_id: string; file_name?: string };
type ImportInput = { projectId: string; creationId: string; name?: string; files: Attachment[] };
type ImportFile = LocalPackageFile & { sha256: string };

function attachmentUrl(value: string) {
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || !url.hostname.endsWith(".oaiusercontent.com") || url.username || url.password || url.port || url.hash) {
    throw new ApiError(400, "invalid_attachment_url", "Attach the file in ChatGPT and pass its file input from OpenAI's download domain.");
  }
  return url;
}

function attachmentPath(name: string) {
  try {
    const path = validatePackagePath(name);
    if (path.includes("/")) throw Error("An attachment needs a single filename.");
    assertUploadAllowed(path);
    return path;
  } catch (error) {
    throw new ApiError(400, "invalid_attachment", (error as Error).message);
  }
}

function dispositionName(header: string) {
  const encoded = /;\s*filename\*=UTF-8'[^']*'([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded.trim()); }
    catch { throw new ApiError(400, "invalid_attachment", "The attachment filename is invalid."); }
  }
  const plain = /;\s*filename=(?:"([^"]*)"|([^;]+))/i.exec(header);
  return plain?.[1] ?? plain?.[2]?.trim();
}

function tooLarge() {
  return new ApiError(413, "attachment_limit", "Attach up to 32 MiB of files per import.");
}

async function downloadAttachment(url: URL, fileName: string | undefined, index: number, remaining: number, signal: AbortSignal) {
  try {
    const response = await fetch(url, { redirect: "error", cache: "no-store", signal });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error("Attachment download failed");
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > remaining) {
      await response.body?.cancel();
      throw tooLarge();
    }
    const reader = response.body?.getReader();
    const chunks: BlobPart[] = [];
    const digest = createHash("sha256");
    let bytes = 0;
    try {
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > remaining) throw tooLarge();
          digest.update(value);
          chunks.push(value);
        }
      }
    } finally {
      await reader?.cancel().catch(() => {});
    }
    if (contentLength !== null && !response.headers.has("content-encoding") && bytes !== Number(contentLength)) {
      throw new Error("Attachment download was incomplete");
    }
    const file = new Blob(chunks, { type: neutralMime });
    const originalName = fileName ?? dispositionName(response.headers.get("content-disposition") ?? "");
    const extension = originalName ? null : rasterImageExtension(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    const path = attachmentPath(originalName ?? `attachment-${index + 1}${extension ? "." + extension : ""}`);
    return { path, file, sha256: digest.digest("hex") };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "attachment_unavailable", "ChatGPT could not provide the full attachment. Attach it again and retry with the same creationId.");
  }
}

function importFailure(error: { message: string; code?: string } | null) {
  if (error?.message.includes("import identity reused")) {
    throw new ApiError(409, "import_reused", "This import ID belongs to different files. Use a new UUID for a new import.");
  }
  if (error?.message === "project archived") {
    throw new ApiError(409, "project_archived", "Reactivate this project before uploading files.");
  }
  dbFailure(error);
}

async function uploadAttachments({ db, workspaceId }: McpIdentity, revisionId: string, files: ImportFile[]) {
  const { transfers } = await preparePackageTransfers(db, workspaceId, revisionId);
  const byPath = new Map(files.map(file => [file.path, file.file]));
  const storage = db.storage.from(STUDIO_BUCKET);
  for (const transfer of transfers) {
    if (transfer.uploaded) continue;
    const file = byPath.get(transfer.path);
    if (!file || !transfer.storageKey || !transfer.token) throw new ApiError(409, "incomplete_upload", "The reserved upload could not be matched to the attachments.");
    const { error } = await storage.uploadToSignedUrl(transfer.storageKey, transfer.token, file, { contentType: file.type, upsert: false });
    if (error) {
      const { data } = await storage.info(transfer.storageKey);
      if (!data || Number(data.size) !== file.size) {
        throw new ApiError(503, "attachment_upload_pending", "The upload paused. Retry with the same creationId and attachments.");
      }
    }
  }
  return verifyStoredFiles(db, await revisionFiles(db, workspaceId, revisionId));
}

export async function importAssets(identity: McpIdentity, input: ImportInput) {
  const { db, workspaceId, userId, grantId } = identity;
  const project = await ownedProject(db, workspaceId, input.projectId);
  // The host can refresh a file's download URL. Persist only a hash of its stable identity.
  const importHash = hash(JSON.stringify([input.projectId, input.name ?? null, input.files.map(file => file.file_id)]));
  const scope = { p_workspace: workspaceId, p_user: userId, p_grant: grantId, p_project: input.projectId, p_import_hash: importHash };
  async function confirm(revisionId: string, verified: Awaited<ReturnType<typeof verifyStoredFiles>>) {
    const { data, error } = await db.rpc("commit_studio_mcp_asset_import", {
      ...scope, p_asset: input.creationId, p_revision: revisionId, p_verified_files: verified,
    });
    importFailure(error);
    if (data?.status !== "committed" || data.assetId !== input.creationId || data.revisionId !== revisionId) {
      throw new ApiError(409, "import_unconfirmed", "The library could not confirm this upload. Check the saved asset before starting another import.");
    }
    return { projectId: input.projectId, ref: { assetId: input.creationId, revisionId }, status: "committed" };
  }

  const prior = await db.from("studio_revisions").select("id").eq("workspace_id", workspaceId)
    .eq("asset_id", input.creationId).eq("state", "committed").eq("provenance->>mcpImportHash", importHash).maybeSingle();
  dbFailure(prior.error);
  if (prior.data) return confirm(prior.data.id, []);
  if (project.status !== "active") throw new ApiError(409, "project_archived", "Reactivate this project before uploading files.");

  const attachments = input.files.map(file => ({ url: attachmentUrl(file.download_url), name: file.file_name && attachmentPath(file.file_name) }));
  const signal = AbortSignal.timeout(60_000);
  const downloaded: Awaited<ReturnType<typeof downloadAttachment>>[] = [];
  let remaining = totalLimit;
  for (const [index, attachment] of attachments.entries()) {
    const file = await downloadAttachment(attachment.url, attachment.name, index, remaining, signal);
    downloaded.push(file);
    remaining -= file.file.size;
  }
  const original = downloaded[0];
  const format = sourceFormat(original.path);
  const kind = downloaded.length === 1 && format?.kind === "image" && format.mimeType !== "image/svg+xml" ? "image" : "file";
  const name = textField(input.name ?? original.path, 160, "Asset name");
  let files: ImportFile[], pkg;
  try {
    if (kind === "image") {
      files = (await sourceImportFiles(new File([original.file], original.path))).map(file => ({ ...file, sha256: original.sha256 }));
    } else {
      downloaded.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
      files = downloaded.map((file, index) => ({ ...file, role: index === 0 ? "master" : "dependency" }));
    }
    const manifest = { files: files.map(({ file, ...entry }) => ({ ...entry, bytes: file.size, mimeType: file.type })),
      dependencies: [], message: "Imported from ChatGPT" };
    pkg = kind === "image" ? validateRevisionPackage(manifest) : validateBridgePackage(manifest);
    if (kind === "image") validateSourcePackage(pkg);
  } catch (error) {
    throw new ApiError(400, "invalid_attachment", (error as Error).message);
  }

  const { data: revisionId, error } = await db.rpc("begin_studio_mcp_asset_import", {
    ...scope, p_creation: input.creationId, p_kind: kind, p_name: name, p_package: pkg,
  });
  importFailure(error);
  let verified: Awaited<ReturnType<typeof verifyStoredFiles>> = [];
  if ((await ownedRevision(db, workspaceId, revisionId)).state !== "committed") {
    try { verified = await uploadAttachments(identity, revisionId, files); }
    catch (error) {
      // Another call may have finalized this same revision while we were transferring it.
      if ((await ownedRevision(db, workspaceId, revisionId)).state !== "committed") throw error;
    }
  }
  return confirm(revisionId, verified);
}
