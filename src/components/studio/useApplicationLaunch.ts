"use client";

import { useEffect, useRef, useState } from "react";
import { blankStarters, blankFiles, blankRequestKey, currentBlankStarters, readBlankRequest, type BlankRequest } from "@/studio/blank-starters";
import { launchableApps } from "@/studio/application-launch";
import { requireUuid } from "@/studio/assets";
import { savePackage, type SaveResult } from "@/studio/transfer-client";

/** One launch operation is shared by every project entry point. */
export function useApplicationLaunch({ projectId, ready, onSaved }: {
  projectId: string; ready: boolean; onSaved: (result: SaveResult) => Promise<void>;
}) {
  const [pending, setPending] = useState<BlankRequest | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const saved = useRef(onSaved); saved.current = onSaved;

  useEffect(() => {
    const read = () => {
      try { setPending(readBlankRequest(localStorage, projectId)); setStorageReady(true); }
      catch { setStorageReady(false); setError("Your saved document start could not be read. Restore browser storage access before opening another application."); }
    };
    read();
    const changed = (event: StorageEvent) => { if (event.key === blankRequestKey(projectId) && !running.current) read(); };
    window.addEventListener("storage", changed);
    return () => { controller.current?.abort(); window.removeEventListener("storage", changed); };
  }, [projectId]);

  async function launch(appId: string, creationId?: string) {
    if (running.current || !storageReady) return;
    if (!ready) { setError("Reactivate this project before starting new work."); return; }
    const starter = currentBlankStarters.find(item => item.appId === appId);
    if (!starter || !launchableApps.some(app => app.id === appId)) { setError("This application is unavailable."); return; }
    running.current = true; setBusy(true); setError(""); setStatus(`Opening ${launchableApps.find(app => app.id === appId)!.name}…`);
    const abort = new AbortController(); controller.current = abort;
    const perform = async () => {
      const previous = readBlankRequest(localStorage, projectId);
      if (previous && (blankStarters.find(item => item.id === previous.templateId)?.appId !== appId || creationId && previous.assetId !== creationId)) {
        setPending(previous);
        throw Error("Another document is still opening. Continue that document before starting a different one.");
      }
      const request: BlankRequest = previous ?? { version: 1, projectId, assetId: creationId ? requireUuid(creationId) : crypto.randomUUID(), templateId: starter.id };
      localStorage.setItem(blankRequestKey(projectId), JSON.stringify(request)); setPending(request);
      const pinned = blankStarters.find(item => item.id === request.templateId)!;
      const files = await blankFiles(pinned, abort.signal);
      const result = await savePackage({ assetId: request.assetId, expectedBaseRevisionId: null, files, dependencies: [], message: "Started a blank document", blankStart: { projectId, templateId: pinned.id }, signal: abort.signal, onProgress: setStatus });
      // The owner adopts the saved URL before recovery intent is removed.
      await saved.current(result);
      if (readBlankRequest(localStorage, projectId)?.assetId === request.assetId) localStorage.removeItem(blankRequestKey(projectId));
      setPending(null);
    };
    try {
      // A second browser tab must not race the persisted project launch intent.
      if (!navigator.locks) throw Error("This browser cannot coordinate document creation. Open Robyn in a supported browser.");
      // Keep callback failures inside JS: Firefox can report a rejected Web
      // Locks callback globally before the request promise delivers its error.
      let failure: { reason: unknown } | undefined;
      await navigator.locks.request(blankRequestKey(projectId), { ifAvailable: true }, async lock => {
        try {
          abort.signal.throwIfAborted();
          if (!lock) throw Error("Another tab is opening a document in this project. Continue there, or try again when it finishes.");
          await perform();
        } catch (reason) { failure = { reason }; }
      });
      if (failure) throw failure.reason;
    } catch (reason) {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Your document could not be opened. Continue to try again.");
    } finally { running.current = false; if (!abort.signal.aborted) setBusy(false); }
  }

  const pendingApp = launchableApps.find(app => app.id === blankStarters.find(item => item.id === pending?.templateId)?.appId);
  return { pending, pendingApp, busy, error, status, storageReady, launch };
}
export type ApplicationLaunch = ReturnType<typeof useApplicationLaunch>;
