import { studioApps } from "./apps/registry";
import { isAppReady, type StudioAppManifest } from "./manifest";

/** Recognise native formats only. An extension match never promises conversion. */
export function nativeImportApps(filename: string, apps: readonly StudioAppManifest[] = studioApps): StudioAppManifest[] {
  const lower = filename.toLowerCase();
  return apps.filter(app => isAppReady(app) && app.formats.native.some(extension => lower.endsWith(extension.toLowerCase())));
}
export function nativeImportApp(filename: string, apps: readonly StudioAppManifest[] = studioApps, selectedAppId?:string): StudioAppManifest | null {
  const matches=nativeImportApps(filename,apps);
  if(selectedAppId)return matches.find(app=>app.id===selectedAppId)??null;
  if(matches.length===1)return matches[0];
  // Preserve the established PDF default for programmatic/direct intake. The
  // creator-facing import dialog asks explicitly whenever several Crafts fit.
  if(matches.length>1&&matches.every(app=>['pdfcraft','markupcraft'].includes(app.id)))return matches.find(app=>app.id==='pdfcraft')??null;
  return null;
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
  const extension=studioApps.flatMap(app=>app.formats.native).sort((a,b)=>b.length-a.length).find(ext=>filename.toLowerCase().endsWith(ext.toLowerCase()));
  return ((extension?filename.slice(0,-extension.length):filename.replace(/\.[^.]+$/, "")).trim() || filename.trim() || "Untitled").slice(0, 160).trim();
}
