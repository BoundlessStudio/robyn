import "server-only";
import { studioApps } from "@/studio/apps/registry";
import { isAppReady } from "@/studio/manifest";
import { mcpConfig } from "./config";

const craftGroups = new Set(["Creative", "Drafting", "Analysis"]);
const releasePath = /^\/([a-z]+craft)\/v\d+\.\d+\.\d+-\d+\.\d+\.\d+\/$/;

export type ChatCraft = {
  id: string;
  name: string;
  nativeFormats: string[];
  readOnly: boolean;
  editorUrl: URL;
};

export function enabledChatCrafts(): ChatCraft[] {
  const releases = new Map(process.env.ROBYN_MCP_CHAT_CRAFTS?.split(",").flatMap(value => {
    const path = value.trim();
    const id = releasePath.exec(path)?.[1];
    return id ? [[id, path] as const] : [];
  }));
  if (!releases.size || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];
  const origin = process.env.ROBYN_MCP_CHAT_EDITOR_ORIGIN;
  if (!origin) return [];
  let editor: URL;
  try { editor = new URL(origin); } catch { return []; }
  if (editor.origin !== origin || editor.protocol !== "https:" || editor.origin === mcpConfig().issuer) return [];
  return studioApps.flatMap(app => {
    const release = releases.get(app.id);
    if (!release || app.id === "photocraft" || !app.studio || !craftGroups.has(app.studio)
      || !isAppReady(app) || !app.editor.bundleUrl) return [];
    const bundle = new URL(app.editor.bundleUrl);
    if (bundle.protocol !== "https:" || releasePath.exec(bundle.pathname)?.[1] !== app.id) return [];
    const editorUrl = new URL("/mcp" + release, editor);
    editorUrl.search = bundle.search;
    return [{ id: app.id, name: app.name, nativeFormats: app.formats.native, readOnly: app.editor.mode === "readOnly", editorUrl }];
  });
}

export function craftResourceUri(appId: string) {
  return `ui://robyn/${appId}/v1.html`;
}
