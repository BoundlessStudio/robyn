export const SOUL_MAX_BYTES = 65_536;
export interface SoulDocument { content: string; revision: string; exists: boolean }
export interface SoulWrite { content: string; revision: string }

export function validateSoulWrite(input: unknown): SoulWrite {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("SOUL fields must be an object.");
  const body = input as Record<string, unknown>;
  if (typeof body.content !== "string" || new TextEncoder().encode(body.content).length > SOUL_MAX_BYTES || body.content.includes("\0")) throw new Error("SOUL.md must be UTF-8 text, up to 64 KB, without null characters.");
  if (typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision)) throw new Error("Reload SOUL.md before saving it.");
  return { content: body.content, revision: body.revision };
}
