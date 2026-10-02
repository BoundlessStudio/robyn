import "server-only";
import { agent37 } from "@/lib/agent37";
import { ApiError } from "@/lib/http";
import { hermesSoulCommand } from "@/lib/hermes-soul-command";
import type { SoulDocument, SoulWrite } from "@/lib/soul-input";

export async function hermesSoul(agentId: string, write?: SoulWrite): Promise<SoulDocument> {
  const result = await agent37.exec(agentId, hermesSoulCommand(write));
  if (result.exit_code !== 0 || result.truncated) throw new ApiError(502, "soul_unavailable", "Hermes identity is not reachable. Try again shortly.");
  let response: { document?: SoulDocument; error?: string };
  try { response = JSON.parse(result.stdout.trim()); }
  catch { throw new ApiError(502, "soul_unavailable", "Hermes returned an unexpected answer. Try again shortly."); }
  if (response.error === "conflict") throw new ApiError(409, "soul_conflict", "SOUL.md changed since you opened it, or the Hermes profile changed. Reload it before saving. Your draft has been kept.");
  if (response.error === "unsafe_file") throw new ApiError(409, "soul_unsafe_file", "SOUL.md must be a regular file, without symbolic or hard links, to edit it here.");
  if (response.error === "too_large") throw new ApiError(413, "soul_too_large", "SOUL.md exceeds the editor's 64 KB limit. Edit it in Files or the terminal.");
  if (response.error === "invalid_text") throw new ApiError(400, "soul_invalid_text", "SOUL.md must be UTF-8 text, up to 64 KB, without null characters.");
  if (response.error || !response.document || typeof response.document.content !== "string" || !/^[a-f0-9]{64}$/.test(response.document.revision)) throw new ApiError(503, "soul_unavailable", "The running Hermes profile is not reachable. Start the agent, then try again shortly.");
  return response.document;
}
