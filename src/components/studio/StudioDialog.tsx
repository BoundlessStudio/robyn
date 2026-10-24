"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/** Native modal provides keyboard focus containment, Escape, and focus return. */
export function StudioDialog({title,eyebrow,close,busy=false,children,returnFocusRef}:{title:string;eyebrow:string;close:()=>void;busy?:boolean;children:React.ReactNode;returnFocusRef?:React.RefObject<HTMLElement|null>}) {
  const ref = useRef<HTMLDialogElement>(null);const titleId = useId();
  // Capture before React mounts an auto-focused input inside the dialog.
  const returnFocus = useRef(returnFocusRef?.current??(typeof document!=="undefined"&&document.activeElement instanceof HTMLElement?document.activeElement:null));
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();const target=returnFocus.current;queueMicrotask(()=>{if(target?.isConnected)target.focus({preventScroll:true});});};},[]);
  return <dialog ref={ref} className="studio-modal" aria-labelledby={titleId} onCancel={event=>{if(event.target!==event.currentTarget)return;event.preventDefault();if(!busy)close();}}>
    <button className="studio-icon-button modal-close" aria-label="Close dialog" disabled={busy} onClick={close}><X size={20}/></button><span className="studio-eyebrow">{eyebrow}</span><h2 id={titleId}>{title}</h2>{children}
  </dialog>;
}
