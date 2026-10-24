"use client";
import { useEffect, useRef, useState } from "react";
import { studioTools as studioApps } from "@/studio/tools";
import { apiFetch } from "@/lib/api";
import type { AssetSummary, AssetRef, PackageFileRole } from "@/studio/assets";
import { savePackage, type SaveResult } from "@/studio/transfer-client";
import { StudioDialog } from "./StudioDialog";

function relativePath(file:File){const path=file.webkitRelativePath;return path?path.slice(path.indexOf("/")+1):file.name;}

export function UploadPackageDialog({projectId,asset,close,saved,returnFocusRef}:{projectId:string;asset?:AssetSummary;close:()=>void;saved:(result:SaveResult)=>Promise<void>;returnFocusRef?:React.RefObject<HTMLElement|null>}) {
  const [name,setName]=useState(asset?.name??"");const [appId,setAppId]=useState(asset?.app_id??studioApps[0].id);
  const [files,setFiles]=useState<File[]>([]);const [master,setMaster]=useState("");const [note,setNote]=useState("");
  const [mode,setMode]=useState<"files"|"folder">("files");const [preview,setPreview]=useState<File|null>(null);
  const [exportFiles,setExportFiles]=useState<File[]>([]);
  const [dependencies,setDependencies]=useState<AssetRef[]|null>(asset?.current_revision_id?null:[]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [progress,setProgress]=useState(0);const [status,setStatus]=useState("");
  const controller=useRef<AbortController|null>(null);const assetId=useRef(asset?.id);
  useEffect(()=>{if(!asset?.current_revision_id)return;let live=true;apiFetch<{dependencies:AssetRef[]}>(`/api/studio/revisions/${asset.current_revision_id}`).then(data=>{if(live)setDependencies(data.dependencies);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[asset?.current_revision_id]);
  function choose(list:FileList|null){const selected=Array.from(list??[]);setFiles(selected);setMaster(selected[0]?relativePath(selected[0]):"");if(!name)setName(selected[0]?.name.replace(/\.[^.]+$/,"")??"");}
  async function upload(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");controller.current=new AbortController();
    try{
      if(!files.length||!master)throw new Error("Choose your native master and any linked files.");
      if(!dependencies)throw new Error("The current package’s linked revisions could not be loaded. Reopen this dialog before saving.");
      if(!assetId.current){const result=await apiFetch<{asset:AssetSummary}>("/api/studio/assets",{method:"POST",body:JSON.stringify({projectId,appId,name})});assetId.current=result.asset.id;}
      const packageFiles=files.map(file=>({file,path:relativePath(file),role:(relativePath(file)===master?"master":"dependency") as PackageFileRole}));
      for(const file of exportFiles)packageFiles.push({file,path:relativePath(file),role:"export"});
      if(preview)packageFiles.push({file:preview,path:`__preview__/${preview.name}`,role:"preview"});
      const result=await savePackage({assetId:assetId.current,expectedBaseRevisionId:asset?.current_revision_id??null,files:packageFiles,dependencies,message:note,signal:controller.current.signal,onProgress:(message,percent)=>{setStatus(message);setProgress(percent);}});
      await saved(result);
    }catch(error){setError((error as Error).name==="AbortError"?"Upload paused. Select the same files to resume.":(error as Error).message);}finally{setBusy(false);}
  }
  return <StudioDialog title={asset?"Keep the work moving.":"Bring your work in."} eyebrow={asset?"SAVE A NEW REVISION":"ADD A NATIVE PACKAGE"} close={close} busy={busy} returnFocusRef={returnFocusRef}><form onSubmit={upload}>
    {!asset&&<><label>Asset name<input value={name} onChange={e=>setName(e.target.value)} maxLength={160} required disabled={busy||Boolean(assetId.current)}/></label><label>Application<select value={appId} onChange={e=>setAppId(e.target.value)} disabled={busy||Boolean(assetId.current)}>{studioApps.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label></>}
    <div className="studio-view-switch" aria-label="Import source"><button type="button" aria-pressed={mode==="files"} disabled={busy} onClick={()=>{setMode("files");setFiles([]);setMaster("");}}>Choose files</button><button type="button" aria-pressed={mode==="folder"} disabled={busy} onClick={()=>{setMode("folder");setFiles([]);setMaster("");}}>Choose a folder</button></div>
    {mode==="files"?<label>Native file and linked media<input key="files" type="file" multiple onChange={e=>choose(e.target.files)} disabled={busy}/></label>:<label>Native package folder<input key="folder" type="file" {...{webkitdirectory:""}} onChange={e=>choose(e.target.files)} disabled={busy}/></label>}
    {files.length>0&&<label>Native master<select value={master} onChange={e=>setMaster(e.target.value)} disabled={busy}>{files.map(file=><option key={relativePath(file)} value={relativePath(file)}>{relativePath(file)}</option>)}</select></label>}
    <label>Exports for other applications (optional)<input type="file" multiple onChange={e=>setExportFiles(Array.from(e.target.files??[]))} disabled={busy}/></label>
    <label>Preview image (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={e=>setPreview(e.target.files?.[0]??null)} disabled={busy}/></label>
    <label>Revision note<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={2} disabled={busy} placeholder="What changed?"/></label>
    <p className="studio-muted">Include the editable document and every file it links to. A folder import preserves subfolders and relative paths. A preview brings the work into your gallery.</p>
    <p className="studio-muted">Add exports such as SVG, PDF or audio when you want to place this work in another application.</p>
    {dependencies&&dependencies.length>0&&<p className="studio-muted">{dependencies.length} linked saved revisions will be kept.</p>}
    {status&&<div role="status" className="studio-upload-progress"><progress value={progress} max={100}/><p>{status}</p></div>}{error&&<p role="alert" className="studio-error">{error}</p>}
    <div className="studio-action-row"><button className="studio-button primary" disabled={busy||files.length===0||dependencies===null}>{busy?"Saving…":"Save native package"}</button>{busy&&<button type="button" className="studio-button" onClick={()=>controller.current?.abort()}>Pause upload</button>}</div>
  </form></StudioDialog>;
}
