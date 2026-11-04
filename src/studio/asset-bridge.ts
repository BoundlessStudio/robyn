import {validatePackagePath, validateRevisionPackage, type RevisionPackage} from "./assets";
import {assertUploadAllowed} from "./upload-policy";
import type {LocalPackageFile} from "./transfer-client";

export const BRIDGE_MAX_FILES = 200;
export const BRIDGE_MAX_FILE_BYTES = 512 * 1024 ** 2;
export const BRIDGE_MAX_BYTES = 1024 ** 3;

/** Check the entire tree before hashing, extracting bytes, or creating an asset. */
export function validateBridgePaths(files: Array<{path:string;bytes:number}>): void {
  if (!files.length || files.length > BRIDGE_MAX_FILES) throw Error("Choose between 1 and 200 files.");
  const paths = new Set<string>();
  let total = 0;
  for (const file of files) {
    const path = validatePackagePath(file.path);
    assertUploadAllowed(path);
    const key = path.toLowerCase();
    if (paths.has(key)) throw Error(`Two files have the same path, including letter case: ${path}`);
    paths.add(key);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > BRIDGE_MAX_FILE_BYTES || (total += file.bytes) > BRIDGE_MAX_BYTES) throw Error("Upload files up to 512 MiB each and 1 GiB in total.");
  }
  for (const path of paths) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) if (paths.has(segments.slice(0,i).join("/"))) throw Error(`A file and folder have the same path: ${path}`);
  }
}

export function bridgeFiles(files: File[], folder = false): LocalPackageFile[] {
  const selected = files.map(file => ({path: folder ? file.webkitRelativePath : file.name, file}));
  // Keep the chosen directory name, as well as every nested relative path.
  validateBridgePaths(selected.map(({path,file}) => ({path,bytes:file.size})));
  selected.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return selected.map(({path,file},index) => ({path,file:file.slice(0,file.size,"application/octet-stream"),role:index ? "dependency" : "master"}));
}

export function validateBridgePackage(value: unknown): RevisionPackage {
  const pkg = validateRevisionPackage(value, {allowEmptyFiles:true});
  validateBridgePaths(pkg.files.map(file => ({path:file.path,bytes:file.bytes})));
  if (pkg.dependencies.length || pkg.files.some(file => !["master","dependency"].includes(file.role) || file.mimeType !== "application/octet-stream")) throw Error("An Asset Bridge upload must preserve only its original files.");
  return pkg;
}
