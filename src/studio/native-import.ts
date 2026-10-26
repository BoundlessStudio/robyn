import { studioApps } from "./apps/registry";
import type { StudioAppManifest } from "./manifest";

/** Recognise native formats only. An extension match never promises conversion. */
export function nativeImportApp(filename: string, apps: readonly StudioAppManifest[] = studioApps): StudioAppManifest | null {
  const lower = filename.toLowerCase();
  const matches = apps.filter(app => app.formats.native.some(extension => lower.endsWith(extension.toLowerCase())));
  if (matches.length !== 1) return null;
  const app = matches[0];
  return app.formats.verification === "verified" && app.editor.status === "verified" && app.editor.bundleUrl ? app : null;
}

export function directNativeImportApp(filename: string): StudioAppManifest | null {
  return nativeImportApp(filename);
}

export function importPath(file: File): string {
  const path = file.webkitRelativePath;
  return path ? path.slice(path.indexOf("/") + 1) : file.name;
}

export async function checkNativeImport<T extends {path: string; role: string; file: Blob}>(appId: string, files: T[]): Promise<T[]> {
  // These three adapters transport self-contained documents. Their engines
  // validate the opaque contents when opening, as in the original direct flow.
  if (["wordcraft", "gridcraft", "pdfcraft"].includes(appId)) return files.filter(file=>file.role==="master");
  // These published adapters require a canonical master name. Normalize only
  // that library path; keep the source bytes and dependency filenames intact.
  const prepared=files.map(file=>file.role!=="master"?file:{...file,path:appId==="lightcraft"?file.path.replace(/[^/]+$/,"catalog.snap"):appId==="filmcraft"?file.path.replace(/\.fcproj$/i,".fcproj"):file.path});
  const { inspectNativeImport } = await import("./generated/native-inspector.mjs");
  const used=new Set(await inspectNativeImport(appId, prepared));
  return prepared.filter(file=>used.has(file.path));
}

export function importedDocumentName(filename: string): string {
  return (filename.replace(/\.[^.]+$/, "").trim() || filename.trim() || "Untitled").slice(0, 160).trim();
}
