"use client";
import { useEffect, useRef, useState } from "react";
import { EDITOR_BRIDGE_PROTOCOL, isTrustedEditorEvent, type EditorMessage } from "@/studio/editor-bridge";
import { createEditorHost } from "@/studio/editor-host";
import type { AssetRef } from "@/studio/assets";
import type { EditorSaveResult } from "@/studio/editor-host";

export function EmbeddedEditor({projectId,initialRef,bundleUrl,name,onSaved,onDirty}:{projectId:string;initialRef:AssetRef;bundleUrl:string;name:string;onSaved:(result:EditorSaveResult)=>void;onDirty:(dirty:boolean)=>void}) {
  const shell=useRef<HTMLDivElement>(null);
  const frame=useRef<HTMLIFrameElement>(null);
  const callbacks=useRef({onSaved,onDirty});callbacks.current={onSaved,onDirty};
  const [binding]=useState(()=>({ref:initialRef,channel:crypto.randomUUID()}));
  const [src,setSrc]=useState("");const [status,setStatus]=useState(`Opening ${name}…`);const [error,setError]=useState("");
  const [expanded,setExpanded]=useState(false);
  const [hasChanges,setHasChanges]=useState(false);
  useEffect(()=>{const changed=()=>setExpanded(document.fullscreenElement===shell.current);document.addEventListener("fullscreenchange",changed);return()=>document.removeEventListener("fullscreenchange",changed);},[]);
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
  return <div ref={shell} className="embedded-editor"><div className="editor-library-status"><span role="status">{status}{hasChanges&&<strong> · Unsaved edits</strong>}</span><button className="studio-button" onClick={()=>{const action=expanded?document.exitFullscreen():shell.current?.requestFullscreen();void action?.catch(()=>setError("Your browser could not change the editor view."));}}>{expanded?"Return to project ↙":"Expand editor ↗"}</button></div>{error&&<div className="studio-error" role="alert">{error}<button className="studio-button" onClick={()=>setError("")}>Dismiss</button></div>}{src&&<iframe ref={frame} src={src} title={`${name} editor`} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" allow="autoplay; clipboard-read; clipboard-write; fullscreen" allowFullScreen referrerPolicy="no-referrer"/>}</div>;
}
