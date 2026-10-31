"use client";

import {useEffect,useRef,useState} from "react";
import {apiFetch} from "@/lib/api";
import {validatePackagePath,type AssetSummary} from "@/studio/assets";
import {checkNativeImport,importPath,importedDocumentName,nativeImportApp,nativeImportApps} from "@/studio/native-import";
import {sourceFormat,sourceImportFiles} from "@/studio/source-import";
import {savePackage,type LocalPackageFile,type SaveResult} from "@/studio/transfer-client";
import {StudioDialog} from "./StudioDialog";

interface ImportTask {id:string;name:string;appId:string|null;files:LocalPackageFile[];created?:boolean;result?:SaveResult}

export function ImportDocumentDialog({projectId,initialFiles,folder=false,close,saved,returnFocusRef}:{
  projectId:string;initialFiles:File[];folder?:boolean;close:()=>void;
  saved:(result:SaveResult)=>Promise<void>;returnFocusRef:React.RefObject<HTMLElement|null>;
}) {
  const [files,setFiles]=useState(initialFiles);
  const initialCandidates=initialFiles.filter(file=>nativeImportApp(file.name));
  const [master,setMaster]=useState(initialCandidates.length===1?importPath(initialCandidates[0]):"");
  const [application,setApplication]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState(0),[status,setStatus]=useState("");
  const [locked,setLocked]=useState(false),[completed,setCompleted]=useState(0);
  const started=useRef(false),running=useRef(false),tasks=useRef<ImportTask[]|null>(null),controller=useRef<AbortController|null>(null);
  const extraFiles=useRef<HTMLInputElement>(null),folderPicker=useRef<HTMLInputElement>(null);
  const candidates=files.filter(file=>nativeImportApps(file.name).length),choices=nativeImportApps(master);
  const app=application?nativeImportApp(master,undefined,application):choices.length===1?choices[0]:null;
  const sources=files.length>0&&files.every(file=>sourceFormat(file.name));

  async function run(selected:File[]=files,main:string=master,chosen:string=application) {
    if(running.current||!selected.length)return;
    if(!main&&!selected.every(file=>sourceFormat(file.name))){
      if(!selected.some(file=>nativeImportApp(file.name)))setError("No supported project was found. Choose a native Craft project, or supported images, audio and video.");
      return;
    }
    const available=nativeImportApps(main);
    if(available.length>1&&!chosen)return;
    running.current=true;setBusy(true);setError("");setProgress(0);setStatus("Checking your files…");
    controller.current=new AbortController();const signal=controller.current.signal;
    try {
      if(!tasks.current){
        if(selected.length>200)throw Error("Choose up to 200 files at a time.");
        const paths=new Set<string>();let bytes=0;
        for(const file of selected){
          const path=validatePackagePath(importPath(file)),key=path.toLowerCase();
          if(paths.has(key))throw Error("Two files have the same path. Choose their containing folder to preserve subfolders.");
          paths.add(key);
          if((!file.size&&(!main||importPath(file)===main))||file.size>512*1024**2||(bytes+=file.size)>1024**3)throw Error("Choose nonempty files up to 512 MiB each, and up to 1 GiB in total.");
        }
        const native=chosen?nativeImportApp(main,undefined,chosen):nativeImportApp(main);
        if(available.length&&!native)throw Error("Choose an application that opens this native project.");
        if(native){
          const packageFiles:LocalPackageFile[]=selected.map(file=>({file,path:importPath(file),role:importPath(file)===main?"master":"dependency"}));
          if(!packageFiles.some(file=>file.role==="master"))throw Error("Choose the project to open.");
          const needed=await checkNativeImport(native.id,packageFiles);
          signal.throwIfAborted();
          tasks.current=[{id:crypto.randomUUID(),name:importedDocumentName(main.split("/").pop()!),appId:native.id,files:needed}];
        }else{
          const prepared:ImportTask[]=[];
          for(const file of selected){prepared.push({id:crypto.randomUUID(),name:importedDocumentName(file.name),appId:null,files:await sourceImportFiles(file)});signal.throwIfAborted();}
          tasks.current=prepared;
        }
        // Freeze intent before the first request, including a lost reply.
        // Recovery cannot repurpose a creation ID for different files.
        setLocked(true);
      }
      for(const task of tasks.current){
        signal.throwIfAborted();
        if(task.result)continue;
        if(task.appId&&!task.created){
          const result=await apiFetch<{asset:AssetSummary}>("/api/studio/assets",{method:"POST",body:JSON.stringify({projectId,appId:task.appId,name:task.name,creationId:task.id}),signal});
          if(result.asset.id!==task.id)throw Error("The import could not be confirmed. Continue this import to retry.");
          task.created=true;
        }
        task.result=await savePackage({assetId:task.id,expectedBaseRevisionId:null,files:task.files,dependencies:[],message:"Imported original",
          ...(!task.appId?{sourceImport:{projectId,name:task.name}}:{}),signal,
          onProgress:(message,percent)=>{setStatus(tasks.current!.length>1?`${task.name} · ${message}`:message);setProgress(percent);}});
        setCompleted(tasks.current.filter(task=>task.result).length);
      }
      await saved(tasks.current.at(-1)!.result!);
    }catch(reason){setError(signal.aborted?"Import paused. Continue when you’re ready.":reason instanceof Error?reason.message:"The import could not be completed.");}
    finally{running.current=false;setBusy(false);}
  }

  function choose(incoming:File[],replace:boolean){
    if(!incoming.length||running.current||tasks.current)return;
    const selected=replace?incoming:[...files,...incoming];
    const matches=selected.filter(file=>nativeImportApp(file.name));
    const main=selected.some(file=>importPath(file)===master)?master:matches.length===1?importPath(matches[0]):"";
    const chosen=nativeImportApps(main).some(app=>app.id===application)?application:"";
    setFiles(selected);setMaster(main);setApplication(chosen);setError("");void run(selected,main,chosen);
  }
  useEffect(()=>{if(started.current)return;started.current=true;void run(initialFiles,master);},[]);

  return <StudioDialog title={busy?(app?`Opening in ${app.name}…`:"Adding to your library…"):error?"Let’s finish this import.":folder&&!files.length?"Bring the whole project.":"Choose what to open."} eyebrow="BRING EXISTING FILES" close={close} busy={busy} returnFocusRef={returnFocusRef}>
    {files.length>0&&<p className="studio-import-filename">{master||files[0].name}{files.length>1&&<small> · {files.length} files selected</small>}</p>}
    <p className="studio-muted">{sources?"Images, audio and video stay available across your project. We’ll save the originals in your project and library, then open a preview.":choices.length>1?"Choose the application for this file. Robyn keeps the original bytes and any linked files together.":"Robyn selects the Craft, keeps the original files and opens your saved project. Linked files stay together."}</p>
    {!locked&&!busy&&candidates.length>1&&<label>Project to open<select aria-label="Project to open" value={master} onChange={event=>{setMaster(event.target.value);if(!nativeImportApps(event.target.value).some(app=>app.id===application))setApplication("");}}><option value="">Choose a project</option>{candidates.map(file=><option key={importPath(file)} value={importPath(file)}>{importPath(file)}</option>)}</select></label>}
    {!locked&&!busy&&choices.length>1&&<label>Open with<select aria-label="Open with" value={application} onChange={event=>setApplication(event.target.value)}><option value="">Choose an application</option>{choices.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>}
    {busy&&<div className="studio-upload-progress" role="status"><progress aria-label="Import progress" value={progress} max={100}/><p>{status}</p></div>}
    {error&&<p role="alert" className="studio-error">{error}</p>}
    {completed>0&&<p className="studio-muted">{completed} {completed===1?"file is":"files are"} already saved. Continuing will resume the remaining work.</p>}
    {!locked&&!busy&&<>
      <p className="studio-muted">{files.length?(candidates.length?"Choose the project’s containing folder to keep the paths together, or add files that belong beside it.":"Choose different files, or choose a folder containing a native project and its linked files."):"Choose the folder containing your project and its linked files."}</p>
      <input ref={extraFiles} type="file" hidden multiple aria-label={candidates.length?"Add linked files":"Choose different files"} onChange={event=>{choose(Array.from(event.currentTarget.files??[]),!candidates.length);event.currentTarget.value="";}}/>
      <input ref={folderPicker} type="file" hidden {...{webkitdirectory:""}} aria-label="Choose project folder" onChange={event=>{choose(Array.from(event.currentTarget.files??[]),true);event.currentTarget.value="";}}/>
      <div className="studio-action-row"><button className={`studio-button${error?" primary":""}`} onClick={()=>folderPicker.current?.click()}>Choose project folder</button>{files.length>0&&<button className="studio-button" onClick={()=>extraFiles.current?.click()}>{candidates.length?"Add linked files":"Choose different files"}</button>}</div>
    </>}
    <div className="studio-action-row">{busy?<button className="studio-button" onClick={()=>controller.current?.abort()}>Pause import</button>:(locked||!error&&(app||sources)||error.startsWith("Import paused"))&&<button className="studio-button primary" onClick={()=>void run()}>{locked||error?"Continue import":app?`Open in ${app.name}`:"Add to library"}</button>}</div>
  </StudioDialog>;
}
