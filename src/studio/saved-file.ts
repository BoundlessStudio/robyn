export function savedFileUrl(revisionId: string, path: string, inline = false) {
  return `/api/studio/revisions/${encodeURIComponent(revisionId)}/file?${new URLSearchParams({ path, ...(inline ? { inline: "1" } : {}) })}`;
}
