"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowUpRight,Lightbulb,Upload,Pencil} from "lucide-react";
import {studioApps} from "@/studio/apps/registry";
import {blankStarters,currentBlankStarters,blankFiles,blankRequestKey,readBlankRequest,type BlankRequest} from "@/studio/blank-starters";
import {savePackage,type SaveResult} from "@/studio/transfer-client";
import type {AssetRef} from "@/studio/assets";
import {AssignmentPanel} from "./AssignmentPanel";

export function OpenCanvas({projectId,ready,onFiles,onFolder,onSaved,onOpen}: {
  projectId:string;ready:boolean;onFiles:()=>void;onFolder:()=>void;
  onSaved:(result:SaveResult)=>Promise<void>;onOpen:(ref:AssetRef)=>void;
}){
  const [view,setView]=useState<"choices"|"idea"|"manual">("choices");
  const [pending,setPending]=useState<BlankRequest|null>(null),[storageReady,setStorageReady]=useState(false);
  const [error,setError]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
  const running=useRef(false),controller=useRef<AbortController|null>(null),heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    try{const saved=readBlankRequest(localStorage,projectId);setPending(saved);setStorageReady(true);const previous=new URL(window.location.href).searchParams.get("start");if(saved)setView("manual");else if(previous==="idea"||previous==="manual")setView(previous);}
    catch(reason){setError((reason as Error).message);}
    return()=>controller.current?.abort();
  },[projectId]);
  function show(next:typeof view){setView(next);const url=new URL(window.location.href);if(next==="choices")url.searchParams.delete("start");else url.searchParams.set("start",next);window.history.replaceState(null,"",url.pathname+url.search+url.hash);requestAnimationFrame(()=>heading.current?.focus());}
  async function create(templateId:string){
    if(running.current||!ready||!storageReady)return;
    running.current=true;setBusy(true);setError("");setStatus("Preparing your blank document…");
    controller.current=new AbortController();const signal=controller.current.signal;
    try{
      // Keep the full intent before any write. Reloading resumes this same file.
      const request=readBlankRequest(localStorage,projectId)??{version:1 as const,projectId,assetId:crypto.randomUUID(),templateId};
      localStorage.setItem(blankRequestKey(projectId),JSON.stringify(request));setPending(request);
      const starter=blankStarters.find(item=>item.id===request.templateId);
      if(!starter)throw Error("This blank document is unavailable. Reload to recover it.");
      const files=await blankFiles(starter,signal);
      const result=await savePackage({assetId:request.assetId,expectedBaseRevisionId:null,files,dependencies:[],message:"Started a blank document",blankStart:{projectId,templateId:starter.id},signal,onProgress:message=>setStatus(message)});
      // Never clear a different tab's newer start when an old reply arrives.
      if(readBlankRequest(localStorage,projectId)?.assetId===request.assetId)localStorage.removeItem(blankRequestKey(projectId));
      setPending(null);await onSaved(result);
    }catch(reason){if(!signal.aborted)setError(reason instanceof Error?reason.message:"Your document could not be opened. Continue to try again.");}
    finally{running.current=false;setBusy(false);}
  }
  const starter=pending?blankStarters.find(item=>item.id===pending.templateId):null;
  return <div className={`open-canvas open-canvas-${view}`}>
    {view!=="choices"&&<button className="canvas-back" onClick={()=>show("choices")} disabled={busy}><ArrowLeft size={14}/> Starting options</button>}
    {view==="choices"&&<>
      <span className="studio-eyebrow">YOUR PROJECT STARTS HERE</span>
      <h2 ref={heading} tabIndex={-1}>A little space<br/>for <em>possibility.</em></h2>
      <p className="canvas-intro">An idea, something you’ve started, or a blank page.</p>
      <div className="canvas-choices">
        <button aria-label="Describe an idea" onClick={()=>show("idea")} disabled={!ready}><Lightbulb size={24}/><strong>Describe an idea</strong><span>Tell your Director what you want to make.</span><b>Make a first draft <ArrowUpRight size={16}/></b></button>
        <button aria-label="Bring existing files" onClick={onFiles} disabled={!ready}><Upload size={24}/><strong>Bring existing files</strong><span>Open a native project, or add images, audio and video to your library.</span><b>Choose files <ArrowUpRight size={16}/></b></button>
        <button aria-label="Start creating" onClick={()=>show("manual")} disabled={!ready}><Pencil size={24}/><strong>Start creating</strong><span>Choose a Craft and make the first mark yourself.</span><b>Open a blank document <ArrowUpRight size={16}/></b></button>
      </div>
      <p className="canvas-drop-hint">You can also drop files here. <button onClick={onFolder} disabled={!ready}>Bring a folder or linked files</button></p>
      {pending&&<button className="studio-button" onClick={()=>show("manual")}>Continue opening {starter?.name??"your document"}</button>}
    </>}
    {view==="idea"&&<div className="canvas-idea"><h2 ref={heading} tabIndex={-1} className="canvas-focus-heading">Describe an idea</h2><AssignmentPanel projectId={projectId} mode="director" canvas onOpen={onOpen}/></div>}
    {view==="manual"&&<>
      <span className="studio-eyebrow">START CREATING</span><h2 ref={heading} tabIndex={-1}>Make the first <em>mark.</em></h2>
      <p className="canvas-intro">Choose a Craft. We’ll open a blank document and save it in your project.</p>
      <p className="canvas-manual-note">Manual editing and saving use no AI allowance. Rename your document whenever you’re ready.</p>
      {pending?<div className="canvas-start-progress"><strong>{starter?.name}</strong><p role="status">{busy?status:"Your document start is saved. Continue to open the same document."}</p>{!busy&&<button className="studio-button primary" disabled={!ready||!storageReady} onClick={()=>void create(pending.templateId)}>Continue opening document</button>}</div>:<div className="canvas-crafts" aria-label="Choose a Craft">{currentBlankStarters.map(item=>{
        const app=studioApps.find(app=>app.id===item.appId)!;
        return <button key={item.id} onClick={()=>void create(item.id)} disabled={!ready||!storageReady||busy}><i style={{background:app.color}} aria-hidden="true">{app.monogram}</i><span><strong>{app.name}</strong><small>{item.description}</small></span><ArrowUpRight size={16}/></button>;
      })}</div>}
    </>}
    {error&&<p role="alert" className="studio-error">{error}</p>}
  </div>;
}
