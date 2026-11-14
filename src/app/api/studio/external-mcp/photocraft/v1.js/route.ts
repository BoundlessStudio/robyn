import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { photoCraftEditorUrl } from "@/studio/mcp/photocraft";

export async function GET() {
  if (!photoCraftEditorUrl()) return new Response(null, { status: 404 });
  const source = await readFile(join(process.cwd(), "build/mcp/photocraft-v1.js"), "utf8");
  return new Response(source, { headers: {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Cross-Origin-Resource-Policy": "cross-origin",
  } });
}
