/** Upload intake policy. Keep scripts and Craft documents uploadable.
 * Shared by directory/ZIP preflight and every incoming revision package. */
export const BLOCKED_UPLOAD_EXTENSIONS = [
  ".exe", ".com", ".msi", ".msp", ".mst", ".scr", ".pif", ".cpl",
  ".dll", ".sys", ".drv", ".ocx", ".so", ".dylib",
  ".app", ".dmg", ".pkg", ".deb", ".rpm", ".apk", ".ipa",
  ".appx", ".appxbundle", ".msix", ".msixbundle", ".jar",
  ".lnk",
] as const;

export function uploadBlockReason(path: string): string | null {
  // Check every segment so an expanded macOS .app bundle is also refused.
  if (path.split("/").some(segment => BLOCKED_UPLOAD_EXTENSIONS.some(extension => segment.toLowerCase().endsWith(extension)) || /\.so(?:\.\d+)+$/i.test(segment))) {
    return "Executable files and installers cannot be uploaded.";
  }
  return null;
}

export function assertUploadAllowed(path: string): void {
  const reason = uploadBlockReason(path);
  if (reason) throw new Error(`${reason} Blocked: ${path}`);
}
