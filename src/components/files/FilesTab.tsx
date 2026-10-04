"use client";

import { FilesView } from "./FilesView";

// The native Files tab. The shell mounts this against the active agent (agentId, from the URL) and
// keeps it MOUNTED-BUT-HIDDEN across tab switches, so FilesView's current directory (held in
// useFileBrowser state) survives moving between tabs. Writes are gated server-side: the BFF routes
// allow workspace admins and the assigned member to manage this agent's files.
export function FilesTab({ agentId }: { agentId: string }) {
  return <FilesView agentId={agentId} />;
}
