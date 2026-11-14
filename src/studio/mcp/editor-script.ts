import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function editorScriptResponse() {
  const source = await readFile(join(process.cwd(), "build/mcp/photocraft-v1.js"), "utf8");
  return new Response(source, { headers: {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Cross-Origin-Resource-Policy": "cross-origin",
  } });
}
