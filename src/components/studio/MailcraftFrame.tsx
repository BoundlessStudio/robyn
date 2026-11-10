"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { MailConnection } from "@/studio/connected-mail";
import { EDITOR_BRIDGE_PROTOCOL, isTrustedEditorEvent } from "@/studio/editor-bridge";

export function MailcraftFrame({ bundle, connection }: { bundle: string; connection: MailConnection }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState("");

  useEffect(() => {
    const url = new URL(bundle);
    const origin = url.origin;
    if (origin === window.location.origin) return;
    const channel = crypto.randomUUID();
    url.hash = new URLSearchParams({ channel, parentOrigin: window.location.origin, mailcraft: connection.provider }).toString();
    const controller = new AbortController();
    let pending = false;

    function receive(event: MessageEvent) {
      const source = frame.current?.contentWindow;
      if (!source || !isTrustedEditorEvent(event, source, origin, channel) || event.data.operation !== "mailcraftRead") return;
      const requestId = event.data.requestId;
      function reply(result: unknown, ok = true) {
        if (controller.signal.aborted || frame.current?.contentWindow !== source) return;
        source!.postMessage({ protocol: EDITOR_BRIDGE_PROTOCOL, channel, kind: "result", requestId, ok,
          ...(ok ? { result } : { error: result }) }, origin);
      }
      if (pending) {
        reply("Another MailCraft read is still running.", false);
        return;
      }
      pending = true;
      void apiFetch("/api/studio/mailcraft/read", {
        method: "POST", signal: controller.signal,
        body: JSON.stringify({ connectionId: connection.id, view: event.data.payload }),
      }).then(result => reply(result), reason => reply(reason instanceof Error ? reason.message : "The MailCraft read could not be confirmed.", false))
        .finally(() => { pending = false; });
    }

    window.addEventListener("message", receive);
    setSrc(url.href);
    return () => { controller.abort(); window.removeEventListener("message", receive); };
  }, [bundle, connection.id, connection.provider]);

  return <div className="embedded-editor">
    {src && <iframe ref={frame} src={src} title="Connected MailCraft" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" />}
  </div>;
}
