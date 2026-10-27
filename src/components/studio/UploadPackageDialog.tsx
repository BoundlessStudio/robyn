"use client";
import { useEffect, useRef, useState } from "react";
import { studioTools as studioApps } from "@/studio/tools";
import { apiFetch } from "@/lib/api";
import type { AssetSummary, AssetRef, PackageFileRole } from "@/studio/assets";
import { describeLocalPackage, savePackage, type SaveResult, type LocalPackageFile } from "@/studio/transfer-client";
import { StudioDialog } from "./StudioDialog";
import { checkNativeImport, importedDocumentName, nativeImportApp } from "@/studio/native-import";
import {sourceFormat} from "@/studio/source-import";

function relativePath(file:File){const path=file.webkitRelativePath;return path?path.slice(path.indexOf("/")+1):file.name;}

export function UploadPackageDialog({projectId,asset,close,saved,returnFocusRef,initialFiles=[],initialMode="files",explanation}:{projectId:string;asset?:AssetSummary;close:()=>void;saved:(result:SaveResult)=>Promise<void>;returnFocusRef?:React.RefObject<HTMLElement|null>;initialFiles?:File[];initialMode?:"files"|"folder";explanation?:string}) {
  const candidates=initialFiles.filter(file=>nativeImportApp(file.name));const initialMaster=candidates.length===1?candidates[0]:initialFiles.length===1?initialFiles[0]:undefined;
  const [name,setName]=useState(asset?.name??(initialMaster?importedDocumentName(initialMaster.name):""));const [appId,setAppId]=useState(asset?.app_id??(initialMaster?nativeImportApp(initialMaster.name)?.id:undefined)??"");
  const [files,setFiles]=useState<File[]>(initialFiles);const [master,setMaster]=useState(initialMaster?relativePath(initialMaster):"");const [note,setNote]=useState("");
  const [mode,setMode]=useState<"files"|"folder">(initialMode);const [preview,setPreview]=useState<File|null>(null);
  const [exportFiles,setExportFiles]=useState<File[]>([]);
  const [dependencies,setDependencies]=useState<AssetRef[]|null>(asset?.current_revision_id?null:[]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [progress,setProgress]=useState(0);const [status,setStatus]=useState("");
  const controller=useRef<AbortController|null>(null);const assetId=useRef(asset?.id);
  const creation=useRef<{creationId:string;name:string;appId:string}|null>(null);
  const [locked,setLocked]=useState(false);
  const prepared=useRef<{files:LocalPackageFile[];dependencies:AssetRef[];message:string;expectedBaseRevisionId:string|null}|null>(null);
  useEffect(()=>{if(!asset?.current_revision_id)return;let live=true;apiFetch<{dependencies:AssetRef[]}>(`/api/studio/revisions/${asset.current_revision_id}`).then(data=>{if(live)setDependencies(data.dependencies);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[asset?.current_revision_id]);
  function choose(list:FileList|null){const selected=Array.from(list??[]);const candidates=selected.filter(file=>nativeImportApp(file.name));const main=candidates.length===1?candidates[0]:selected.length===1?selected[0]:undefined;setFiles(selected);setMaster(main?relativePath(main):"");if(!name&&main)setName(importedDocumentName(main.name));if(!asset&&!creation.current&&main){const app=nativeImportApp(main.name);if(app)setAppId(app.id);}}
  async function upload(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");controller.current=new AbortController();
    try{
      if(!files.length||!master||!appId)throw new Error("Choose the application, native master and any linked files.");
      if(!name.trim())throw new Error("Give this document a name.");
      if(!dependencies)throw new Error("The current package’s linked revisions could not be loaded. Reopen this dialog before saving.");
      if(!prepared.current){
        if(appId==="research"?!/\.md$/i.test(master):nativeImportApp(master)?.id!==appId)throw Error("Choose this application's supported native project. Source media belongs in Import files, and rendered output belongs in Add exports.");
        const original=files.map(file=>({file,path:relativePath(file),role:(relativePath(file)===master?"master":"dependency") as PackageFileRole}));
        const packageFiles:LocalPackageFile[]=appId==="research"?original:await checkNativeImport(appId,original);
        for(const file of exportFiles){
          let path=`exports/${relativePath(file)}`;while(packageFiles.some(existing=>existing.path.toLowerCase()===path.toLowerCase()))path=`exports/${path}`;
          packageFiles.push({file:file.slice(0,file.size,sourceFormat(file.name)?.mimeType||file.type||"application/octet-stream"),path,role:"export"});
        }
        if(preview)packageFiles.push({file:preview,path:`__preview__/${preview.name}`,role:"preview"});
        await describeLocalPackage({files:packageFiles,dependencies,message:note,signal:controller.current.signal,onProgress:setStatus});
        controller.current.signal.throwIfAborted();
        prepared.current={files:packageFiles,dependencies,message:note,expectedBaseRevisionId:asset?.current_revision_id??null};setLocked(true);
      }
      if(!assetId.current){creation.current??={creationId:crypto.randomUUID(),appId,name:name.trim()};const result=await apiFetch<{asset:AssetSummary}>("/api/studio/assets",{method:"POST",body:JSON.stringify({projectId,...creation.current}),signal:controller.current.signal});if(result.asset.id!==creation.current.creationId)throw new Error("The asset could not be confirmed. Retry this import.");assetId.current=result.asset.id;}
      const result=await savePackage({assetId:assetId.current,...prepared.current,signal:controller.current.signal,onProgress:(message,percent)=>{setStatus(message);setProgress(percent);}});
      await saved(result);
    }catch(error){setError((error as Error).name==="AbortError"?"Upload paused. Continue to finish this import.":(error as Error).message);}finally{setBusy(false);}
  }
  return <StudioDialog title={asset?"Keep the work moving.":"Bring your work in."} eyebrow={asset?"SAVE A NEW REVISION":"ADD A NATIVE PACKAGE"} close={close} busy={busy} returnFocusRef={returnFocusRef}><form onSubmit={upload}>
    {explanation&&<p className="studio-muted" role="status">{explanation}</p>}
    {!asset&&<><label>Asset name<input value={name} onChange={e=>setName(e.target.value)} maxLength={160} required disabled={busy||locked||Boolean(creation.current)}/></label><label>Application<select aria-label="Application" value={appId} onChange={e=>setAppId(e.target.value)} required disabled={busy||locked||Boolean(creation.current)}><option value="" disabled>Choose an application</option>{studioApps.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label></>}
    <div className="studio-view-switch" aria-label="Import source"><button type="button" aria-pressed={mode==="files"} disabled={busy||locked} onClick={()=>{setMode("files");setFiles([]);setMaster("");}}>Choose files</button><button type="button" aria-pressed={mode==="folder"} disabled={busy||locked} onClick={()=>{setMode("folder");setFiles([]);setMaster("");}}>Choose a folder</button></div>
    {files.length>0&&<p className="studio-muted">{files.length} {files.length===1?"file is":"files are"} selected for this import.</p>}
    {mode==="files"?<label>{files.length?"Replace selected files":"Native file and linked media"}<input key="files" type="file" multiple onChange={e=>choose(e.target.files)} disabled={busy||locked}/></label>:<label>{files.length?"Replace selected folder":"Native package folder"}<input key="folder" type="file" {...{webkitdirectory:""}} onChange={e=>choose(e.target.files)} disabled={busy||locked}/></label>}
    {files.length>0&&<label>Native master<select aria-label="Native master" value={master} onChange={e=>setMaster(e.target.value)} required disabled={busy||locked}><option value="" disabled>Choose the main document</option>{files.map(file=><option key={relativePath(file)} value={relativePath(file)}>{relativePath(file)}</option>)}</select></label>}
    <label>Exports for other applications (optional)<input type="file" multiple onChange={e=>setExportFiles(Array.from(e.target.files??[]))} disabled={busy||locked}/></label>
    <label>Preview image (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={e=>setPreview(e.target.files?.[0]??null)} disabled={busy||locked}/></label>
    <label>Revision note<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={2} disabled={busy||locked} placeholder="What changed?"/></label>
    <p className="studio-muted">Include the editable document and every file it links to. A folder import preserves subfolders and relative paths. A preview brings the work into your gallery.</p>
    <p className="studio-muted">Add exports such as SVG, PDF or audio when you want to place this work in another application.</p>
    {dependencies&&dependencies.length>0&&<p className="studio-muted">{dependencies.length} linked saved revisions will be kept.</p>}
    {status&&<div role="status" className="studio-upload-progress"><progress value={progress} max={100}/><p>{status}</p></div>}{error&&<p role="alert" className="studio-error">{error}</p>}
    <div className="studio-action-row"><button className="studio-button primary" disabled={busy||files.length===0||dependencies===null||!appId||!master}>{busy?"Saving…":locked?"Continue import":"Save native package"}</button>{busy&&<button type="button" className="studio-button" onClick={()=>controller.current?.abort()}>Pause upload</button>}</div>
  </form></StudioDialog>;
}
