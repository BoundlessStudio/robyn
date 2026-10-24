"use client";
import {useEffect,useImperativeHandle,useRef,useState} from "react";
import {Markdown} from "@/components/Markdown";
import {apiFetch} from "@/lib/api";
import type {AssetRef,PackageFileRole} from "@/studio/assets";
import {digestFile,savePackage,type LocalPackageFile} from "@/studio/transfer-client";
import type {EditorSaveResult} from "@/studio/editor-host";
import type {EmbeddedEditorHandle,EditorViewState} from "./EmbeddedEditor";

interface Package {ref:AssetRef;dependencies:AssetRef[];files:Array<{path:string;role:PackageFileRole;mimeType:string;bytes:number;sha256:string;downloadUrl:string}>}
export function ResearchNotebook({ref,initialRef,onSaved,onDirty,onState,onRequest}:{ref?:React.Ref<EmbeddedEditorHandle>;initialRef:AssetRef;onSaved:(result:EditorSaveResult)=>void;onDirty:(dirty:boolean)=>void;onState:(state:EditorViewState)=>void;onRequest:()=>void}){
  const shell=useRef<HTMLDivElement>(null),callbacks=useRef({onSaved,onDirty,onState});callbacks.current={onSaved,onDirty,onState};
  const [binding]=useState(initialRef),base=useRef(initialRef),files=useRef<LocalPackageFile[]>([]),dependencies=useRef<AssetRef[]>([]);
  const [text,setText]=useState(""),[saved,setSaved]=useState(""),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const [status,setStatus]=useState("Opening research notebook…"),[error,setError]=useState("");
  const dirty=text!==saved;
  useImperativeHandle(ref,()=>({expand:()=>{void shell.current?.requestFullscreen().catch(()=>setError("The notebook could not expand."));}}),[]);
  useEffect(()=>{callbacks.current.onDirty(dirty);callbacks.current.onState({status,dirty,error});},[status,dirty,error]);
  useEffect(()=>{
    const controller=new AbortController();let live=true;
    async function load(){
      const pkg=await apiFetch<Package>(`/api/studio/revisions/${binding.revisionId}`,{signal:controller.signal});
      if(pkg.ref.assetId!==binding.assetId||pkg.ref.revisionId!==binding.revisionId)throw Error("The notebook does not match this saved revision.");
      const master=pkg.files.find(file=>file.role==="master");
      if(!master||!master.path.endsWith(".md")||master.bytes>1024*1024||pkg.files.reduce((n,file)=>n+file.bytes,0)>50*1024*1024)throw Error("Open a Markdown research notebook up to 1 MiB, with up to 50 MiB of evidence.");
      const local:LocalPackageFile[]=[];
      for(const file of pkg.files){
        const response=await fetch(file.downloadUrl,{signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer"});if(!response.ok)throw Error("Research files could not be downloaded. Reopen this notebook to retry.");
        const blob=await response.blob();
        if(blob.size!==file.bytes||await digestFile(blob,controller.signal)!==file.sha256)throw Error("Research file integrity check failed. Reopen the saved notebook.");
        local.push({path:file.path,role:file.role,file:new Blob([blob],{type:file.role==="master"?"text/markdown":file.mimeType})});
      }
      const content=new TextDecoder("utf-8",{fatal:true}).decode(await local.find(file=>file.role==="master")!.file.arrayBuffer());
      if(live){files.current=local;dependencies.current=pkg.dependencies;setText(content);setSaved(content);setLoaded(true);setStatus("Saved notebook open");}
    }
    void load().catch(error=>{if(live&&!controller.signal.aborted)setError(error.message);});
    return()=>{live=false;controller.abort();callbacks.current.onDirty(false);};
  },[binding]);
  useEffect(()=>{
    function leaving(event:BeforeUnloadEvent){if(dirty){event.preventDefault();event.returnValue="";}}
    function navigate(event:MouseEvent){const link=(event.target as Element)?.closest?.("a[href]");if(dirty&&link instanceof HTMLAnchorElement&&link.target!=="_blank"&&!window.confirm("Your notebook has unsaved edits. Leave without saving?")){event.preventDefault();event.stopPropagation();}}
    window.addEventListener("beforeunload",leaving);document.addEventListener("click",navigate,true);
    return()=>{window.removeEventListener("beforeunload",leaving);document.removeEventListener("click",navigate,true);};
  },[dirty]);
  async function save(){
    if(busy||!dirty||!text.trim())return;
    const snapshot=text;if(new Blob([snapshot]).size>1024*1024){setError("Keep this notebook under 1 MiB.");return;}
    setBusy(true);setError("");
    try{
      const nextFiles=files.current.map(file=>file.role==="master"?{...file,file:new Blob([snapshot],{type:"text/markdown"})}:file);
      const result=await savePackage({assetId:base.current.assetId,expectedBaseRevisionId:base.current.revisionId,files:nextFiles,dependencies:dependencies.current,message:"Creator edited the research notebook",onProgress:message=>setStatus(message)});
      if(result.status==="committed"){base.current=result;files.current=nextFiles;setSaved(snapshot);setStatus("Notebook saved to your library");}
      else{setStatus("Conflict preserved");setError("Another revision was saved first. Your edited notebook is preserved in revision history; reopen the current revision or save this conflict as a new asset.");}
      callbacks.current.onSaved({...result,mode:"revision"});
    }catch(error){setError((error as Error).message);setStatus("Save not confirmed");}finally{setBusy(false);}
  }
  return <section className="research-notebook" ref={shell} aria-label="Research notebook">
    <div className="research-notebook-tools"><span>FIELD NOTES <i aria-hidden="true">↗</i></span><div><button className="studio-tool-button" aria-pressed={editing} onClick={()=>setEditing(value=>!value)} disabled={!loaded}>{editing?"Read notebook":"Edit notebook"}</button><button className="studio-tool-button" onClick={save} disabled={!loaded||busy||!dirty||!text.trim()}>{busy?"Saving…":"Save revision"}</button><button className="studio-tool-button" onClick={onRequest} disabled={!loaded||dirty||busy} title={dirty?"Save your edits before handing this notebook to Research":"Continue from this exact saved notebook"}>Continue with Research ↗</button></div></div>
    {error&&<p className="studio-error" role="alert">{error}</p>}
    {!loaded?<p role="status">{error?"The saved notebook could not open.":status}</p>:editing?<textarea className="research-notebook-input" aria-label="Notebook Markdown" value={text} onChange={event=>setText(event.target.value)} spellCheck/>:<article className="research-notebook-paper"><Markdown content={text} controls components={{img:()=>null,a:({href,children})=>href&&/^https?:\/\//i.test(href)?<a href={href} target="_blank" rel="noreferrer noopener">{children} ↗</a>:<span>{children}</span>}}/></article>}
  </section>;
}
