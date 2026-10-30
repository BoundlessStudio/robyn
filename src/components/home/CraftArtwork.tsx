"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { craftArtwork } from "./craft-artwork";

export function CraftArtwork({ appId, name, number, nearby, onInspect }: { appId: string; name: string; number: number; nearby: boolean; onInspect: (open: boolean) => void }) {
  const artwork = craftArtwork[appId];
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const inspect = useRef(onInspect); inspect.current = onInspect;

  useEffect(() => {
    if (open) { dialog.current?.showModal(); inspect.current(true); }
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    inspect.current(false);
    opener.current?.focus({ preventScroll: true });
  }

  if (!artwork) return null;

  function screen(enlarged = false) {
    return <span className={`craft-ui-window${artwork.fullFrame ? " craft-ui-full" : ""}${enlarged && original ? " craft-ui-original" : ""}`}>
      <Image src={artwork.src} alt={artwork.alt} width={artwork.fullFrame ? 1600 : 1440} height={1000} sizes={enlarged ? "90vw" : "(max-width: 900px) 94vw, 48vw"} quality={85} loading="eager" draggable={false} />
    </span>;
  }

  return <>
    <figure className="craft-capture" data-craft={appId}>
      <div className="craft-capture-meta"><span><span aria-hidden="true">[ </span>{String(number).padStart(2, "0")} / {name}<span aria-hidden="true"> ]</span></span><span>INSIDE THE TOOL</span></div>
      <button ref={opener} type="button" className="craft-screen" aria-label={`Explore the ${name} interface`} onClick={() => { setOriginal(false); setOpen(true); }}>
        <span className="screen-corner corner-nw" aria-hidden="true">+</span><span className="screen-corner corner-ne" aria-hidden="true">+</span><span className="screen-corner corner-sw" aria-hidden="true">+</span><span className="screen-corner corner-se" aria-hidden="true">+</span>
        {nearby ? screen() : <span className="craft-ui-window" />}
        <span className="craft-screen-zoom" aria-hidden="true"><ArrowUpRight size={16} /></span>
      </button>
      <figcaption><span aria-hidden="true">↳ </span>{artwork.tools}<span className="craft-capture-inspect">EXPLORE ↗</span></figcaption>
    </figure>
    <dialog ref={dialog} className="craft-lightbox" aria-labelledby={`${appId}-preview-title`} aria-describedby={`${appId}-preview-note`} onClose={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {open && <div className="craft-lightbox-paper">
        <header><div><span className="flight-kicker">{String(number).padStart(2, "0")} / {name}</span><h2 id={`${appId}-preview-title`}>{artwork.title}</h2></div><button type="button" className="craft-lightbox-close" onClick={close} aria-label="Close interface preview" autoFocus><X size={22} /></button></header>
        <div className="craft-lightbox-art">{screen(true)}</div>
        <footer><p id={`${appId}-preview-note`}>{appId === "research" ? "Actual Research notebook · Example brief" : `Actual ${name} editor · Example project`}</p><button type="button" className="craft-colour-toggle" aria-pressed={original} onClick={() => setOriginal(value => !value)}>{original ? "Paper & ink" : "Original colour"}<span aria-hidden="true"> ↗</span></button></footer>
      </div>}
    </dialog>
  </>;
}
