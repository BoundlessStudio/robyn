export function savedFileUrl(revisionId: string, path: string, inline = false) {
  return `/api/studio/revisions/${encodeURIComponent(revisionId)}/file?${new URLSearchParams({ path, ...(inline ? { inline: "1" } : {}) })}`;
}

export function savedFileDownloadOptions(path: string, mimeType: string, inline = false) {
  // Opaque uploads and exports stay downloads even when a caller asks to preview them.
  return inline && /^(image|audio|video)\//.test(mimeType) ? undefined : { download: path.split("/").pop() };
}
