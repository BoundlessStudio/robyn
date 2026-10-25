"use client";
import { useRef, useState } from "react";
import { savedFileUrl } from "@/studio/saved-file";

export function SavedMedia({ revisionId, file, name }: { revisionId: string; file: { path: string; mimeType: string }; name: string }) {
  const [renewal, setRenewal] = useState(0);
  const [error, setError] = useState(false);
  const playback = useRef<{ time: number; playing: boolean } | null>(null);
  const src = `${savedFileUrl(revisionId, file.path, true)}&renew=${renewal}`;
  function refresh(event: React.SyntheticEvent<HTMLMediaElement>) {
    if (Date.now() - renewal < 30000) { setError(true); return; }
    playback.current = { time: event.currentTarget.currentTime, playing: !event.currentTarget.paused };
    setRenewal(Date.now());
  }
  function restore(event: React.SyntheticEvent<HTMLMediaElement>) {
    const position = playback.current;
    if (!position) return;
    playback.current = null;
    event.currentTarget.currentTime = position.time;
    if (position.playing) void event.currentTarget.play().catch(() => {});
  }
  return <>{file.mimeType.startsWith("image/") ? <img src={src} alt={`Preview of ${name}`}/> :
    file.mimeType.startsWith("video/") ? <video controls src={src} onError={refresh} onLoadedMetadata={restore}/> :
      <audio controls src={src} onError={refresh} onLoadedMetadata={restore}/>}
    {error && <p role="alert">Playback could not resume. <a href={savedFileUrl(revisionId, file.path)}>Download the saved file</a> or reopen this source.</p>}</>;
}
