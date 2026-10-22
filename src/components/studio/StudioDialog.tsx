"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/** Native modal provides keyboard focus containment, Escape, and focus return. */
export function StudioDialog({title,eyebrow,close,busy=false,children}:{title:string;eyebrow:string;close:()=>void;busy?:boolean;children:React.ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);const titleId = useId();
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className="studio-modal" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!busy)close();}}>
    <button className="studio-icon-button modal-close" aria-label="Close dialog" disabled={busy} onClick={close}><X size={20}/></button><span className="studio-eyebrow">{eyebrow}</span><h2 id={titleId}>{title}</h2>{children}
  </dialog>;
}
