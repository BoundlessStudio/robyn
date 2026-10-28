"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowUpRight,Download,File,History,Plus} from "lucide-react";
import {apiFetch,readApiError} from "@/lib/api";
import type {AssetSummary} from "@/studio/assets";
import type {OpenAssetResult} from "@/studio/editor-bridge";
import type {SaveResult} from "@/studio/transfer-client";
import {downloadBlob,downloadSavedPackage,packageZip} from "@/studio/package-download";
import {savedFileUrl} from "@/studio/saved-file";
import {studioTools} from "@/studio/tools";
import {AppIcon} from "./AppIcon";
import {DocumentName} from "./DocumentName";
import {SavedMedia} from "./SavedMedia";
import {SourceCredits,SourceProvenance,type SourceCredit} from "./SourceProvenance";
import {usePagedStudioList} from "./usePagedStudioList";
import {AddExportsDialog} from "./AddExportsDialog";
import {UploadPackageDialog} from "./UploadPackageDialog";
import {ProjectSection} from "./ProjectSection";

interface Revision {id:string;state:string;revision_number:number|null;message:string;created_at:string}
interface SavedPackage extends OpenAssetResult {revision:Revision;sourceCredits?:SourceCredit[]}

export function LibraryAsset(props:{projectId:string;assetId:string;initialRevisionId?:string}){
  return <ProjectSection projectId={props.projectId}>{()=> <ProjectAsset key={props.assetId} {...props}/>}</ProjectSection>;
}

function ProjectAsset({projectId,assetId,initialRevisionId}:{projectId:string;assetId:string;initialRevisionId?:string}){
  const [asset,setAsset]=useState<AssetSummary|null>(null),[selectedRevision,setSelectedRevision]=useState<string|null>(initialRevisionId??null);
  const [loadedPackage,setPackage]=useState<SavedPackage|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
  const [addingExports,setAddingExports]=useState(false),[importing,setImporting]=useState(false);
  const importButton=useRef<HTMLButtonElement>(null),download=useRef<AbortController|null>(null);
  const history=usePagedStudioList<Revision>(asset?`/api/studio/assets/${assetId}/revisions`:null,"revisions");
  const reload=useCallback(async()=>{const result=await apiFetch<{asset:AssetSummary}>(`/api/studio/assets/${assetId}`);if(result.asset.id!==assetId||result.asset.project_id!==projectId)throw Error("This asset does not belong to this project.");setAsset(result.asset);},[assetId,projectId]);
  useEffect(()=>{void reload().catch(reason=>setError(reason.message));return()=>download.current?.abort();},[reload]);
  const revisionId=selectedRevision??asset?.current_revision_id;
  useEffect(()=>{
    const url=new URL(window.location.href);
    if(selectedRevision)url.searchParams.set("revision",selectedRevision);else url.searchParams.delete("revision");
    if(url.href!==window.location.href)window.history.replaceState(null,"",url.pathname+url.search);
  },[selectedRevision]);
  const pkg=loadedPackage&&loadedPackage.ref.revisionId===revisionId&&loadedPackage.ref.assetId===assetId?loadedPackage:null;
  useEffect(()=>{
    setPackage(null);if(!asset||!revisionId)return;
    const controller=new AbortController();
    apiFetch<SavedPackage>(`/api/studio/revisions/${revisionId}`,{signal:controller.signal}).then(result=>{
      if(controller.signal.aborted)return;
      if(result.ref.assetId!==assetId||result.ref.revisionId!==revisionId)throw Error("The revision does not belong to this asset.");
      setPackage(result);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[asset,assetId,revisionId]);
  async function saved(result:SaveResult){
    setAddingExports(false);setImporting(false);setSelectedRevision(result.revisionId);
    setNotice(result.status==="conflict"?"Another revision was saved first. Your files are preserved as a conflicting revision. Open it in the project to continue or save a copy.":"Your new revision is saved.");
    await Promise.all([reload(),history.reload()]);
  }
  async function exportPackage(){
    if(!pkg||busy)return;setBusy(true);setError("");download.current=new AbortController();
    try{
      const source=await downloadSavedPackage(pkg.ref,download.current.signal,setStatus);
      setStatus("Building your download…");
      const zip=await packageZip(source.files,download.current.signal);download.current.signal.throwIfAborted();
      downloadBlob(zip,`${asset?.name??"Asset"}.zip`);setNotice("Your complete saved package is ready to download.");
    }catch(reason){setError(download.current.signal.aborted?"Download cancelled.":(reason as Error).message);}finally{setBusy(false);setStatus("");}
  }
  async function restore(){
    if(!pkg||!asset||busy)return;setBusy(true);setError("");
    try{
      const response=await fetch(`/api/studio/assets/${assetId}/restore`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revisionId:pkg.ref.revisionId,expectedBaseRevisionId:asset.current_revision_id})});
      if(!response.ok&&response.status!==409)throw Error(await readApiError(response,"This revision could not be restored."));
      const result=await response.json() as SaveResult;if(!["committed","conflict"].includes(result.status))throw Error("The restore was not confirmed.");
      await saved(result);
    }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }
  const app=studioTools.find(row=>row.id===asset?.app_id),native=!asset?.asset_kind||asset.asset_kind==="native";
  const preview=pkg?.files.find(file=>file.role==="preview"&&/^(image|audio|video)\//.test(file.mimeType))??pkg?.files.find(file=>file.role==="export"&&/^(image|audio|video)\//.test(file.mimeType))??(!native?pkg?.files.find(file=>file.role==="master"):undefined);
  const exports=pkg?.files.filter(file=>file.role==="export")??[];
  return <div className="studio-page library-asset-page">
    <Link className="library-back" href={`/dashboard/projects/${projectId}/library`}><ArrowLeft size={15}/>Back to assets</Link>
    {error&&<p role="alert" className="studio-error">{error}</p>}
    {notice&&<p role="status" className="studio-success">{notice}</p>}
    {!asset?(!error&&<p role="status">Loading asset…</p>):<>
      <header className="studio-page-heading"><div><span className="studio-eyebrow">{app?.name??`${asset.asset_kind} SOURCE`}</span><h1>{asset.name}</h1><DocumentName asset={asset} onSaved={setAsset}/></div><Link className="studio-button primary" href={`/dashboard/projects/${asset.project_id}?${new URLSearchParams({asset:asset.id,...(revisionId?{revision:revisionId}:{})})}`}>Open {app?`in ${app.name}`:"in project"}<ArrowUpRight size={16}/></Link></header>
      <div className="library-asset-layout">
        <section className="library-asset-main" aria-label="Asset files">
          <div className="library-preview">{preview&&revisionId?<SavedMedia key={`${revisionId}:${preview.path}`} revisionId={revisionId} file={preview} name={asset.name}/>:<div className="library-preview-placeholder"><AppIcon app={app}/><p>{pkg?"Native document · ready to open":revisionId?"Loading saved files…":"Awaiting first saved revision"}</p></div>}</div>
          <section className="library-file-section"><div className="library-section-heading"><div><h2>{native?"Exports":"Original & editing copies"}</h2><p className="studio-muted">{native?"Use these files in compatible Crafts or download them to share.":"The original stays unchanged. Use Place from studio in a compatible Craft."}</p></div>{native&&pkg&&revisionId===asset.current_revision_id&&<button className="studio-button" disabled={busy} onClick={()=>setAddingExports(true)}><Plus size={15}/>Add exports</button>}</div>
            {native&&!exports.length&&<p className="studio-muted">No exports saved yet. Export from {app?.name??"your Craft"}, then add the result here.</p>}
            <FileList files={native?exports:pkg?.files.filter(file=>file.role!=="preview")??[]} revisionId={revisionId}/>
          </section>
          {native&&<section className="library-file-section"><div className="library-section-heading"><div><h2>Native package</h2><p className="studio-muted">Keep the document and its linked files together when opening it elsewhere.</p></div><button className="studio-button" disabled={!pkg||busy} onClick={()=>void exportPackage()}><Download size={15}/>Download package</button></div><FileList files={pkg?.files.filter(file=>file.role!=="export")??[]} revisionId={revisionId}/></section>}
          {busy&&status&&<div role="status" className="studio-note">{status}<button className="studio-button" onClick={()=>download.current?.abort()}>Cancel download</button></div>}
          {pkg&&<><SourceProvenance provenance={pkg.provenance}/><SourceCredits credits={pkg.sourceCredits}/></>}
        </section>
        <aside className="library-revisions" aria-label="Saved revisions"><div className="library-section-heading"><h2><History size={16}/>Versions</h2>{native&&<button ref={importButton} className="studio-button" disabled={busy} onClick={()=>setImporting(true)}>Import revision</button>}</div>
          <p className="studio-muted">Every save keeps an exact version. Choose one to inspect or download.</p>
          {history.error&&<p className="studio-error" role="alert">{history.error}</p>}
          <div className="library-revision-list">{history.rows.map(revision=><button key={revision.id} disabled={revision.state==="uploading"||busy} aria-pressed={revision.id===revisionId} onClick={()=>{setError("");setSelectedRevision(revision.id);}}><strong>{revision.revision_number?`Revision ${revision.revision_number}`:revision.state==="conflict"?"Preserved conflict":"Upload in progress"}{revision.id===asset.current_revision_id&&<span>Current</span>}</strong><small>{new Date(revision.created_at).toLocaleString()}</small><p>{revision.message||"Native package"}</p></button>)}</div>
          {history.nextCursor&&<button className="studio-button" disabled={history.loading||busy} onClick={()=>void history.loadMore()}>Load older revisions</button>}
          {native&&pkg?.revision.state==="committed"&&revisionId!==asset.current_revision_id&&<button className="studio-button" disabled={busy} onClick={()=>void restore()}>Restore as new revision</button>}
          {pkg?.dependencies.length? <p className="studio-muted">{pkg.dependencies.length} exact source {pkg.dependencies.length===1?"revision":"revisions"} linked to this version.</p>:null}
        </aside>
      </div>
      {addingExports&&pkg&&<AddExportsDialog assetRef={pkg.ref} name={asset.name} close={()=>setAddingExports(false)} saved={saved}/>}
      {importing&&<UploadPackageDialog projectId={asset.project_id} asset={asset} close={()=>setImporting(false)} saved={saved} returnFocusRef={importButton}/>}
    </>}
  </div>;
}

function FileList({files,revisionId}:{files:OpenAssetResult["files"];revisionId?:string|null}){
  return <ul className="library-file-list">{files.map(file=><li key={file.path}><File size={18}/><div><strong>{file.path}</strong><small>{file.role} · {file.bytes<1024**2?`${(file.bytes/1024).toFixed(1)} KB`:`${(file.bytes/1024**2).toFixed(1)} MB`}</small></div>{revisionId&&<a className="studio-button" href={savedFileUrl(revisionId,file.path)} download aria-label={`Download ${file.path}`}><Download size={15}/>Download</a>}</li>)}</ul>;
}
