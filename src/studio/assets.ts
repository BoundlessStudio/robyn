export interface AssetRef { assetId: string; revisionId: string }
export type PackageFileRole = "master" | "preview" | "export" | "dependency";
export interface PackageFile {
  path: string;
  role: PackageFileRole;
  mimeType: string;
  bytes: number;
  sha256: string;
}
export interface RevisionPackage {
  files: PackageFile[];
  dependencies: AssetRef[];
  message: string;
}
export interface AssetSummary {
  id: string;
  project_id: string;
  app_id: string | null;
  asset_kind?: "native" | "image" | "audio" | "video";
  name: string;
  current_revision_id: string | null;
  created_at: string;
  preview_url?: string | null;
  project?: { name: string } | null;
}
export interface ProjectSummary { id: string; name: string; brief: string; status: "active" | "archived"; created_at: string; updated_at: string; preview_url?: string | null }

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireUuid(value: unknown, label = "ID"): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

/** Portable package paths: no traversal, URL decoding ambiguity, or filenames
 * that change meaning when materialized on a Windows/native workstation. */
export function validatePackagePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 512 || value.normalize("NFC") !== value) throw new Error("Invalid package path.");
  if (/[\\:%?*<>|\x00-\x1f\x7f]/.test(value)) throw new Error("Package paths must be safe relative file paths.");
  const segments = value.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.endsWith(".") || segment !== segment.trim() || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment)) throw new Error("Package paths must be safe relative file paths.");
  }
  return value;
}

export function validateRevisionPackage(value: unknown): RevisionPackage {
  if (!value || typeof value !== "object") throw new Error("A revision package is required.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 200) throw new Error("A revision needs between 1 and 200 files.");
  const paths = new Set<string>();
  let totalBytes = 0;
  const files: PackageFile[] = input.files.map(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid package file.");
    const file = raw as Record<string, unknown>;
    const path = validatePackagePath(file.path);
    // Native workstations and editors may use case-insensitive filesystems.
    if (paths.has(path.toLocaleLowerCase("en-US"))) throw new Error("Package file paths must be unique, including letter case.");
    paths.add(path.toLocaleLowerCase("en-US"));
    if (!["master", "preview", "export", "dependency"].includes(String(file.role))) throw new Error("Invalid package file role.");
    if (typeof file.mimeType !== "string" || file.mimeType.length > 120 || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType)) throw new Error("Invalid file media type.");
    if (typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 512 * 1024 ** 2) throw new Error("Pilot files must be between 1 byte and 512 MiB.");
    if (typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(file.sha256)) throw new Error("Each file needs its SHA-256 digest.");
    totalBytes += file.bytes;
    return { path, role: file.role as PackageFileRole, mimeType: file.mimeType, bytes: file.bytes, sha256: file.sha256.toLowerCase() };
  });
  if (files.filter(file => file.role === "master").length !== 1) throw new Error("A revision must have exactly one native master file.");
  if (totalBytes > 1024 ** 3) throw new Error("A pilot revision package cannot exceed 1 GiB.");
  if (!Array.isArray(input.dependencies) || input.dependencies.length > 100) throw new Error("Supply at most 100 exact dependency revisions.");
  const refs = new Set<string>();
  const dependencies = input.dependencies.map(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid asset reference.");
    const ref = raw as Record<string, unknown>;
    const assetId = requireUuid(ref.assetId, "dependency asset ID");
    const revisionId = requireUuid(ref.revisionId, "dependency revision ID");
    const key = `${assetId}:${revisionId}`;
    if (refs.has(key)) throw new Error("Duplicate dependency revision.");
    refs.add(key);
    return { assetId, revisionId };
  });
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > 1000) throw new Error("Revision notes must be under 1,000 characters.");
  return { files, dependencies, message };
}
