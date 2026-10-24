"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { EDITOR_BRIDGE_PROTOCOL, isTrustedEditorEvent, type EditorMessage } from "@/studio/editor-bridge";
import { createEditorHost } from "@/studio/editor-host";
import type { AssetRef } from "@/studio/assets";
import type { EditorSaveResult } from "@/studio/editor-host";

export interface EditorViewState { status:string; dirty:boolean; error:string }
export interface EmbeddedEditorHandle { expand:()=>void }

export function EmbeddedEditor({ref,projectId,initialRef,bundleUrl,name,onSaved,onDirty,onState}:{ref?:React.Ref<EmbeddedEditorHandle>;projectId:string;initialRef:AssetRef;bundleUrl:string;name:string;onSaved:(result:EditorSaveResult)=>void;onDirty:(dirty:boolean)=>void;onState:(state:EditorViewState)=>void}) {
  const shell=useRef<HTMLDivElement>(null);
  const frame=useRef<HTMLIFrameElement>(null);
  const callbacks=useRef({onSaved,onDirty,onState});callbacks.current={onSaved,onDirty,onState};
  const [binding]=useState(()=>({ref:initialRef,channel:crypto.randomUUID()}));
  const [src,setSrc]=useState("");const [status,setStatus]=useState(`Opening ${name}…`);const [error,setError]=useState("");
  const [openingDelayed,setOpeningDelayed]=useState(false);const [frameAttempt,setFrameAttempt]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const fullscreenReturnFocus=useRef<HTMLElement|null>(null);
  const wasExpanded=useRef(false);
  const [hasChanges,setHasChanges]=useState(false);
  function hasBlankFrame(){try{return frame.current?.contentDocument?.URL==="about:blank";}catch{return false;}}
  useEffect(()=>{
    if(!src)return;
    const timer=window.setTimeout(()=>{if(hasBlankFrame())setOpeningDelayed(true);},8000);
    return()=>window.clearTimeout(timer);
  },[src,frameAttempt]);
  function retryOpening(){
    setOpeningDelayed(false);
    // Only replace a document that never opened; a live editor may contain work.
    if(hasBlankFrame())setFrameAttempt(value=>value+1);
  }
  useImperativeHandle(ref,()=>({expand:()=>{fullscreenReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;void shell.current?.requestFullscreen().catch(()=>setError("Your browser could not expand the editor."));}}),[]);
  useEffect(()=>callbacks.current.onState({status,dirty:hasChanges,error}),[status,hasChanges,error]);
  useEffect(()=>{const changed=()=>{const active=document.fullscreenElement===shell.current;setExpanded(active);if(wasExpanded.current&&!active)queueMicrotask(()=>fullscreenReturnFocus.current?.focus({preventScroll:true}));wasExpanded.current=active;};document.addEventListener("fullscreenchange",changed);return()=>document.removeEventListener("fullscreenchange",changed);},[]);
  useEffect(()=>{
    const controller=new AbortController();
    const url=new URL(bundleUrl);
    if(url.origin===window.location.origin||!(url.protocol==="https:"||(process.env.NODE_ENV==="development"&&url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))){
      setError("The editor requires its own trusted origin.");return;
    }
    url.hash=new URLSearchParams({channel:binding.channel,parentOrigin:window.location.origin,assetId:binding.ref.assetId,revisionId:binding.ref.revisionId}).toString();
    let dirty=false;let active=true;
    const host=createEditorHost({projectId,initialRef:binding.ref,signal:controller.signal,onDirty:value=>{dirty=value;setHasChanges(value);callbacks.current.onDirty(value);if(!value)setStatus("Saved revision open");},onStatus:setStatus,onSaved:result=>{setError("");setStatus(result.status!=="committed"?"Conflicting save preserved — check revision history":result.mode==="copy"?"Copy saved · Still editing the original":"Saved to your library");callbacks.current.onSaved(result);}});
    function receive(event:MessageEvent){
      if(!isTrustedEditorEvent(event,frame.current?.contentWindow??null,url.origin,binding.channel))return;
      const message=event.data as EditorMessage;
      void host.handle(message).then(result=>{
        if(active)frame.current?.contentWindow?.postMessage({protocol:EDITOR_BRIDGE_PROTOCOL,channel:binding.channel,requestId:message.requestId,kind:"result",ok:true,result},url.origin);
      },reason=>{
        if(!active)return;const messageText=reason instanceof Error?reason.message:"Editor operation failed.";
        setError(messageText);
        if(message.operation==="saveAsset")setStatus("Save not confirmed");
        frame.current?.contentWindow?.postMessage({protocol:EDITOR_BRIDGE_PROTOCOL,channel:binding.channel,requestId:message.requestId,kind:"result",ok:false,error:messageText},url.origin);
      });
    }
    function leaving(event:BeforeUnloadEvent){if(dirty){event.preventDefault();event.returnValue="";}}
    function navigate(event:MouseEvent){const link=(event.target as Element)?.closest?.("a[href]");if(dirty&&link instanceof HTMLAnchorElement&&!link.hasAttribute("download")&&link.target!=="_blank"&&!window.confirm("This editor has unsaved work. Leave without saving?")){event.preventDefault();event.stopPropagation();}}
    window.addEventListener("message",receive);window.addEventListener("beforeunload",leaving);document.addEventListener("click",navigate,true);
    setSrc(url.toString());
    return()=>{active=false;controller.abort();window.removeEventListener("message",receive);window.removeEventListener("beforeunload",leaving);document.removeEventListener("click",navigate,true);callbacks.current.onDirty(false);};
  },[binding,bundleUrl,projectId]);
  return <div ref={shell} className="embedded-editor">{expanded&&<div className="editor-fullscreen-bar"><span role="status">{hasChanges?"Unsaved edits":status}</span><button className="studio-tool-button" onClick={()=>{void document.exitFullscreen().catch(()=>setError("Your browser could not return to the project."));}}>Return to project ↙</button></div>}{error&&<div className="studio-error" role="alert">{error}<button className="studio-button" onClick={()=>setError("")}>Dismiss</button></div>}{openingDelayed&&<div className="editor-startup"><div><span className="studio-eyebrow">YOUR CREATIVE WORKSPACE</span><h2>{name} is taking a little longer.</h2><p role="status">The editor hasn’t opened yet. Try opening it again to continue with your saved revision.</p><button className="studio-button primary" onClick={retryOpening}>Open {name}</button></div></div>}{src&&<iframe key={frameAttempt} ref={frame} src={src} onLoad={()=>setOpeningDelayed(false)} title={`${name} editor`} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" allow="autoplay; clipboard-read; clipboard-write; fullscreen" allowFullScreen referrerPolicy="no-referrer"/>}</div>;
}
