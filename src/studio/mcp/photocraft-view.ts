import { App } from "@modelcontextprotocol/ext-apps";
import type { AssetRef } from "@/studio/assets";
import { EDITOR_BRIDGE_PROTOCOL, isTrustedEditorEvent } from "@/studio/editor-bridge";
import { createEditorHost } from "@/studio/editor-host";
import type { ApiFetch } from "@/lib/api";

declare const __ROBYN_PHOTOCRAFT_CONFIG__: { editorUrl: string; studioOrigin: string; anonKey: string; tool: string;
  editorName?: string; appId?: string; readOnly?: boolean };
const config = __ROBYN_PHOTOCRAFT_CONFIG__;
const editorName = config.editorName ?? "PhotoCraft";
const app = new App({ name: editorName, version: "1.0.0" }, { availableDisplayModes: ["inline", "fullscreen"] }, { autoResize: false });
const notice = document.querySelector<HTMLParagraphElement>("#notice")!;
const desktop = matchMedia("(pointer: fine) and (hover: hover)");
const room = matchMedia("(min-width: 850px)");
let launch: { projectId: string; ref: AssetRef; session: string } | undefined;
let teardown: (() => void) | undefined;

function display() {
  if (teardown || !launch) return;
  const host = app.getHostContext();
  if (host?.platform === "mobile" || !desktop.matches) {
    notice.textContent = `Open this conversation in desktop ChatGPT to use ${editorName}.`;
    void app.sendSizeChanged({ height: 64 }).catch(() => {});
    return;
  }
  if (host?.displayMode !== "fullscreen" && host?.availableDisplayModes?.includes("fullscreen")) {
    notice.textContent = `Expand ${editorName} to use the desktop view.`;
    const button = document.createElement("button");
    button.textContent = `Open ${editorName}`;
    button.onclick = () => {
      void app.requestDisplayMode({ mode: "fullscreen" }).then(({ mode }) => {
        if (mode !== "fullscreen") notice.textContent = `This chat cannot expand ${editorName}. Open the saved revision from the conversation.`;
      }).catch(() => { notice.textContent = `${editorName} could not expand. Try opening it again.`; });
    };
    notice.append(" ", button);
    void app.sendSizeChanged({ height: 64 }).catch(() => {});
    return;
  }
  if (!room.matches) {
    notice.textContent = `Widen this desktop window to open ${editorName}.`;
    return;
  }
  const { projectId, ref, session } = launch;
  const binding = { projectId, ...ref };
  const fetcher: ApiFetch = async (path, init) => {
    const reply = await app.callServerTool({
      name: config.tool,
      arguments: { binding, session, path, method: init?.method ?? "GET", ...(config.appId && { appId: config.appId }),
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) },
    }, { signal: init?.signal ?? undefined, timeout: 120_000 });
    if (reply.isError) {
      const error = reply.content.find(item => item.type === "text");
      return new Response(error?.text ?? JSON.stringify({ error: { message: `${editorName} could not reach the library.` } }), { status: 400 });
    }
    if (!reply._meta || !Object.hasOwn(reply._meta, "payload")) throw Error(`${editorName} did not receive a library response from this chat.`);
    return Response.json(reply._meta.payload);
  };
  const controller = new AbortController();
  let dirty = false;
  const editor = createEditorHost({
    projectId, initialRef: ref, signal: controller.signal, readOnly: config.readOnly,
    transport: { fetch: fetcher, anonKey: config.anonKey },
    onDirty: value => { dirty = value; }, onStatus: () => {}, onSaved: () => {},
  });
  const channel = crypto.randomUUID();
  const url = new URL(config.editorUrl);
  const frame = document.createElement("iframe");
  frame.title = editorName;
  frame.referrerPolicy = "no-referrer";
  frame.sandbox.add("allow-scripts", "allow-same-origin", "allow-modals", "allow-downloads");
  frame.allow = "clipboard-read; clipboard-write";
  url.hash = new URLSearchParams({ channel, parentOrigin: self.origin, ...ref }).toString();
  async function receive(event: MessageEvent) {
    if (!isTrustedEditorEvent(event, frame.contentWindow, url.origin, channel)) return;
    const request = event.data;
    const response = { protocol: EDITOR_BRIDGE_PROTOCOL, channel, requestId: request.requestId, kind: "result" };
    try {
      const result = await editor.handle(request);
      frame.contentWindow?.postMessage({ ...response, ok: true, result }, url.origin);
    } catch (error) {
      frame.contentWindow?.postMessage({ ...response, ok: false, error: error instanceof Error ? error.message : `${editorName} could not complete this request.` }, url.origin);
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty) event.preventDefault();
  }
  addEventListener("message", receive, { signal: controller.signal });
  addEventListener("beforeunload", beforeUnload, { signal: controller.signal });
  teardown = () => {
    controller.abort();
    frame.remove();
  };
  frame.src = url.href;
  notice.hidden = true;
  document.body.append(frame);
}

app.ontoolresult = result => {
  if (launch) return;
  if (result.isError) {
    notice.textContent = `${editorName} could not open this revision. Choose a saved ${editorName} document.`;
    return;
  }
  const { projectId, ref } = (result.structuredContent ?? {}) as Partial<{ projectId: string; ref: AssetRef }>;
  const session = result._meta?.session;
  if (!projectId || !ref || typeof session !== "string") {
    notice.textContent = `Choose a saved ${editorName} document to open.`;
    return;
  }
  launch = { projectId, ref, session };
  display();
};
app.onhostcontextchanged = display;
app.onteardown = async () => {
  teardown?.();
  desktop.removeEventListener("change", display);
  room.removeEventListener("change", display);
  return {};
};
desktop.addEventListener("change", display);
room.addEventListener("change", display);
void app.connect().catch(() => { notice.textContent = `${editorName} could not connect to this chat.`; });
