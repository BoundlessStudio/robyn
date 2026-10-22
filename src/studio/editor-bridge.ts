import type { AssetRef, AssetSummary, RevisionPackage } from "./assets";

export const EDITOR_BRIDGE_PROTOCOL = "robyn.editor.v1";
export interface OpenAssetResult {
  ref: AssetRef;
  files: Array<{ path: string; role: string; bytes: number; sha256: string; downloadUrl: string }>;
  dependencies: AssetRef[];
}
export interface EditorBridge {
  openAsset(ref: AssetRef): Promise<OpenAssetResult>;
  saveAsset(input: { assetId: string; expectedBaseRevisionId: string | null; package: RevisionPackage }): Promise<{ ref: AssetRef; status: "committed" | "conflict" }>;
  listProjectAssets(): Promise<AssetSummary[]>;
  insertAsset(ref: AssetRef): Promise<OpenAssetResult>;
  notifyChanges(input: { dirty: boolean; assetId: string }): void;
  requestAgentEdit(input: { ref: AssetRef; instruction: string }): Promise<{ assignmentId: string }>;
}

export type EditorMessage = {
  protocol: typeof EDITOR_BRIDGE_PROTOCOL;
  channel: string;
  requestId: string;
  operation: keyof EditorBridge;
  payload: unknown;
};

/** The host must additionally check event.source === iframe.contentWindow and
 * event.origin === the pinned editor origin. The channel is per iframe load. */
export function isEditorMessage(value: unknown, channel: string): value is EditorMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.protocol === EDITOR_BRIDGE_PROTOCOL && message.channel === channel
    && typeof message.requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(message.requestId)
    && ["openAsset", "saveAsset", "listProjectAssets", "insertAsset", "notifyChanges", "requestAgentEdit"].includes(String(message.operation));
}
