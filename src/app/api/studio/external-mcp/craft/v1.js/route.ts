import { enabledChatCrafts } from "@/studio/mcp/chat-crafts";
import { editorScriptResponse } from "@/studio/mcp/editor-script";

export async function GET() {
  if (!enabledChatCrafts().length) return new Response(null, { status: 404 });
  return editorScriptResponse();
}
