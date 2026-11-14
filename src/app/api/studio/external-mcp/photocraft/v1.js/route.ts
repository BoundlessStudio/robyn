import { photoCraftEditorUrl } from "@/studio/mcp/photocraft";
import { editorScriptResponse } from "@/studio/mcp/editor-script";

export async function GET() {
  if (!photoCraftEditorUrl()) return new Response(null, { status: 404 });
  return editorScriptResponse();
}
