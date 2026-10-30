"use client";
import { AppIcon } from "./AppIcon";
import { savedFileUrl } from "@/studio/saved-file";
import { SavedMedia } from "./SavedMedia";
import { ResearchNotebook } from "./ResearchNotebook";
import {ApplicationLauncher, LaunchProgress} from "./ApplicationLauncher";
import {useApplicationLaunch} from "./useApplicationLaunch";
import {DocumentName} from "./DocumentName";
import {ProjectName} from "./ProjectName";
import { Markdown } from "@/components/Markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, File, X, History, Upload, ArrowUpRight, RefreshCw, MoreHorizontal, Maximize2, Info, Images } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { apiFetch, readApiError } from "@/lib/api";
import { studioTools as studioApps } from "@/studio/tools";
import type { AssetSummary, ProjectSummary, AssetRef } from "@/studio/assets";
import type { SaveResult } from "@/studio/transfer-client";
import type { EditorSaveResult } from "@/studio/editor-host";
import { UploadPackageDialog } from "./UploadPackageDialog";
import { ImportDocumentDialog } from "./ImportDocumentDialog";
import { nativeImportApp } from "@/studio/native-import";
import { sourceFormat } from "@/studio/source-import";
import { StudioDialog } from "./StudioDialog";
import { EmbeddedEditor, type EmbeddedEditorHandle, type EditorViewState } from "./EmbeddedEditor";
import { ProjectHeader } from "./ProjectHeader";
import { SourceProvenance, SourceCredits, type SourceCredit } from "./SourceProvenance";

interface Revision {id:string;state:string;revision_number:number|null;message:string;created_at:string}
interface OpenPackage {ref:AssetRef;revision:Revision;files:Array<{path:string;role:string;mimeType:string;bytes:number;downloadUrl:string}>;dependencies:AssetRef[];provenance?:Record<string,unknown>;sourceCredits?:SourceCredit[]}
// Candidate bundles can be reviewed together without promoting their manifests.
const previewEditors:Record<string,string>=process.env.NODE_ENV==="development"?JSON.parse(process.env.NEXT_PUBLIC_EDITOR_PREVIEW_URLS??"{}"):{};

export function ProjectWorkspace({projectId,initialAssetId,initialRevisionId,initialAppId,initialLaunchId}:{projectId:string;initialAssetId?:string;initialRevisionId?:string;initialAppId?:string;initialLaunchId?:string}) {
  const [project,setProject]=useState<ProjectSummary|null>(null);const [assets,setAssets]=useState<AssetSummary[]>([]);
  const [selected,setSelected]=useState(initialAssetId??"");const [tabs,setTabs]=useState<string[]>(initialAssetId?[initialAssetId]:[]);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
  const [upload,setUpload]=useState<"new"|"revision"|null>(null);const [revisions,setRevisions]=useState<Revision[]>([]);const [history,setHistory]=useState(false);
  const [intake,setIntake]=useState<{files:globalThis.File[];folder:boolean}|null>(null);
  const [dropTarget,setDropTarget]=useState(false);
  const filePicker=useRef<HTMLInputElement>(null);const importButton=useRef<HTMLButtonElement>(null);
  const [loadedPackage,setPackageData]=useState<OpenPackage|null>(null);const [opening,setOpening]=useState(false);const [revisionId,setRevisionId]=useState<string|null>(null);
  const [focusedRevision,setFocusedRevision]=useState<AssetRef|null>(initialAssetId&&initialRevisionId?{assetId:initialAssetId,revisionId:initialRevisionId}:null);
  const [fileDetails,setFileDetails]=useState(false);
  const [fork,setFork]=useState<string|null>(null);
  const [applicationsOpen,setApplicationsOpen]=useState(false);
  const applicationsButton=useRef<HTMLButtonElement>(null);
  const initialLaunchHandled=useRef(false);
  const [revisionCursor,setRevisionCursor]=useState<string|null>(null),[paging,setPaging]=useState(false);
  const selectedNow=useRef(selected);selectedNow.current=selected;
  const embeddedEditor=useRef<EmbeddedEditorHandle>(null);
  const documentMenuButton=useRef<HTMLButtonElement>(null);
  const [editorState,setEditorState]=useState<EditorViewState>({status:"Opening editor…",dirty:false,error:""});
  const editorDirty=useRef(false);const [editorEpoch,setEditorEpoch]=useState(0);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),6500);return()=>window.clearTimeout(timer);},[notice]);
  useEffect(()=>{
    const url=new URL(window.location.href);
    if(selected){url.searchParams.set("asset",selected);for(const key of ["start","app","launch"])url.searchParams.delete(key);}else url.searchParams.delete("asset");
    if(focusedRevision?.assetId===selected)url.searchParams.set("revision",focusedRevision.revisionId);else url.searchParams.delete("revision");
    if(url.href!==window.location.href)window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  },[selected,focusedRevision]);
  const asset=assets.find(row=>row.id===selected);const app=studioApps.find(app=>app.id===asset?.app_id);
  const previewEditorUrl=process.env.NODE_ENV==="development"&&app?(app.id===process.env.NEXT_PUBLIC_EDITOR_PREVIEW_APP?process.env.NEXT_PUBLIC_EDITOR_PREVIEW_URL:previewEditors[app.id]):null;
  const editorUrl=previewEditorUrl??(app?.editor.status==="verified"?app.editor.bundleUrl:null);
  const targetRevision=focusedRevision&&focusedRevision.assetId===asset?.id?focusedRevision.revisionId:asset?.current_revision_id;
  const packageData=loadedPackage&&loadedPackage.ref.assetId===asset?.id&&loadedPackage.ref.revisionId===targetRevision?loadedPackage:null;
  const reload=useCallback(async()=>{const data=await apiFetch<{project:ProjectSummary;assets:AssetSummary[]}>(`/api/studio/projects/${projectId}`);
    const selectedId=selectedNow.current;
    if(selectedId&&!data.assets.some(row=>row.id===selectedId)){const extra=await apiFetch<{asset:AssetSummary}>(`/api/studio/assets/${selectedId}`);if(extra.asset.project_id===projectId)data.assets.push(extra.asset);}
    setProject(data.project);setAssets(previous=>[...new Map([...previous,...data.assets].map(row=>[row.id,row])).values()]);return data;},[projectId]);
  async function loadMoreRevisions(){if(!revisionCursor||!asset||paging)return;setPaging(true);const assetId=asset.id;try{const data=await apiFetch<{revisions:Revision[];nextCursor:string|null}>(`/api/studio/assets/${assetId}/revisions?cursor=${encodeURIComponent(revisionCursor)}`);if(selectedNow.current!==assetId)return;setRevisions(previous=>[...new Map([...previous,...data.revisions].map(row=>[row.id,row])).values()]);setRevisionCursor(data.nextCursor);}catch(error){setError((error as Error).message);}finally{setPaging(false);}}
  useEffect(()=>{let live=true;reload().catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[reload]);
  useEffect(()=>{if(selected)return;const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void reload().catch(()=>{});},7000);return()=>window.clearInterval(timer);},[reload,selected]);
  useEffect(()=>{
    let live=true;setPackageData(null);setRevisions([]);setRevisionCursor(null);
    const target=focusedRevision?.assetId===asset?.id?focusedRevision?.revisionId:asset?.current_revision_id;
    setRevisionId(target??null);
    if(!asset){setOpening(false);return;}
    apiFetch<{revisions:Revision[];nextCursor:string|null}>(`/api/studio/assets/${asset.id}/revisions`).then(data=>{if(live){setRevisions(data.revisions);setRevisionCursor(data.nextCursor);}}).catch(error=>{if(live)setError(error.message);});
    if(target){setOpening(true);apiFetch<OpenPackage>(`/api/studio/revisions/${target}`).then(data=>{if(data.ref.assetId!==asset.id||data.ref.revisionId!==target)throw Error("The revision does not belong to this asset.");if(live)setPackageData(data);}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setOpening(false);});}
    else setOpening(false);
    return()=>{live=false;};
  },[asset?.id,asset?.current_revision_id,focusedRevision]);
  function leaveEditor(){return !editorDirty.current||window.confirm("This editor has unsaved work. Leave without saving?");}
  function select(id:string){if(id===selected){return;}if(!leaveEditor())return;setEditorEpoch(value=>value+1);setSelected(id);setTabs(current=>current.includes(id)?current:[...current,id]);setFocusedRevision(null);setError("");setHistory(false);setFileDetails(false);}
  function closeTab(id:string){if(id===selected&&!leaveEditor())return;setTabs(current=>current.filter(tab=>tab!==id));if(selected===id){setEditorEpoch(value=>value+1);setFocusedRevision(null);setSelected(tabs.find(tab=>tab!==id)??"");}}
  function importPackage(mode:"new"|"revision"){if(leaveEditor())setUpload(mode);}
  function receiveFiles(files:globalThis.File[],folder=false){
    if(!project||upload||intake||(!files.length&&!folder)||!leaveEditor())return;
    setIntake({files:folder?[]:files,folder});
  }
  function dragOver(event:React.DragEvent){
    if(!event.dataTransfer.types.includes("Files"))return;
    event.preventDefault();event.dataTransfer.dropEffect="copy";setDropTarget(true);
  }
  function dragLeave(event:React.DragEvent){
    if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))setDropTarget(false);
  }
  function dropFiles(event:React.DragEvent){
    if(!event.dataTransfer.types.includes("Files"))return;
    event.preventDefault();setDropTarget(false);
    const folder=Array.from(event.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory);
    receiveFiles(Array.from(event.dataTransfer.files),folder);
  }
  async function saved(result:SaveResult){
    const url=new URL(window.location.href);url.searchParams.set("asset",result.assetId);for(const key of ["app","launch","start"])url.searchParams.delete(key);window.history.replaceState(null,"",url.pathname+url.search+url.hash);
    setApplicationsOpen(false);
    setEditorEpoch(value=>value+1);
    setFileDetails(result.status==="conflict");
    setUpload(null);setIntake(null);selectedNow.current=result.assetId;setFocusedRevision(result);setSelected(result.assetId);setTabs(current=>current.includes(result.assetId)?current:[...current,result.assetId]);setHistory(result.status==="conflict");
    setNotice(result.status==="conflict"?"Another revision was saved first. Your work is preserved; reload the current version or save your revision as a new asset.":"Saved as a new revision.");
    try{await reload();}catch{setError("Your revision was saved, but the project could not refresh. Reload this page to reopen it.");}
  }
  async function editorSaved(result:EditorSaveResult){
    if(result.status==="conflict")setFileDetails(true);
    setNotice("");
    try{await reload();
      if(result.mode!=="copy"){
        setFocusedRevision(result);setHistory(result.status==="conflict");
        if(result.mode==="saveAs"&&result.status==="committed"){setSelected(result.assetId);setTabs(current=>current.includes(result.assetId)?current:[...current,result.assetId]);}
      }
    }catch{setError("The save is confirmed, but the project could not refresh. Keep the editor open and try again.");}
  }
  function openRevision(id:string){if(!asset||!leaveEditor())return;setFileDetails(false);setError("");setFocusedRevision({assetId:asset.id,revisionId:id});setEditorEpoch(value=>value+1);}
  async function restore(id:string){if(!asset||!leaveEditor())return;setBusy(true);setError("");try{const response=await fetch(`/api/studio/assets/${asset.id}/restore`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revisionId:id,expectedBaseRevisionId:asset.current_revision_id})});if(!response.ok&&response.status!==409)throw new Error(await readApiError(response,"Could not restore"));const result=await response.json() as SaveResult;if(!result.status)throw new Error("The revision could not be restored.");await saved(result);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function forkRevision(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!fork||!leaveEditor())return;const data=new FormData(event.currentTarget);setBusy(true);try{const result=await apiFetch<SaveResult>(`/api/studio/revisions/${fork}/fork`,{method:"POST",body:JSON.stringify({name:data.get("name")})});setFork(null);await saved(result);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  const launch=useApplicationLaunch({projectId,ready:project?.status==="active",onSaved:saved});
  function launchApplication(appId:string){
    if(launch.busy||!leaveEditor())return;
    if(asset)setApplicationsOpen(true);
    void launch.launch(appId);
  }
  useEffect(()=>{
    if(!project||!launch.storageReady||!initialAppId||initialAssetId||initialLaunchHandled.current)return;
    initialLaunchHandled.current=true;
    void launch.launch(initialAppId,initialLaunchId);
  },[project,launch.storageReady,initialAppId,initialLaunchId,initialAssetId]);
  // Dashboard shares this route with the editor. Clear its local selection even
  // when Next keeps the component mounted during a same-route navigation.
  function showDashboard(){setSelected("");setFocusedRevision(null);setApplicationsOpen(false);setHistory(false);setFileDetails(false);setError("");}
  function chooseFiles(folder=false){setApplicationsOpen(false);if(folder)receiveFiles([],true);else filePicker.current?.click();}
  const employeeParams=new URLSearchParams();
  if(asset&&targetRevision){employeeParams.set("asset",asset.id);employeeParams.set("revision",targetRevision);}
  const employeesHref=`/dashboard/projects/${projectId}/employees${employeeParams.size?`?${employeeParams}`:""}`;
  const launcher=<ApplicationLauncher projectId={projectId} launch={launch} ready={project?.status==="active"} onLaunch={launchApplication} onFiles={()=>chooseFiles()} onFolder={()=>chooseFiles(true)} importButtonRef={importButton} employeesHref={employeesHref} compact={Boolean(asset)}/>;
  const importReturnFocus=asset?applicationsButton:importButton;
  const sourceMedia=Boolean(asset?.asset_kind&&asset.asset_kind!=="native");
  const preview=sourceMedia?(packageData?.files.find(file=>file.role==="preview")??packageData?.files.find(file=>file.role==="export"&&file.mimeType.startsWith(`${asset?.asset_kind}/`))??packageData?.files.find(file=>file.role==="master")):packageData?.files.find(file=>file.role==="preview");
  const assetDetails = asset&&<>{packageData&&<div className="asset-package"><SourceProvenance provenance={packageData.provenance}/><SourceCredits credits={packageData.sourceCredits}/><h3>{sourceMedia?"SOURCE MEDIA":"NATIVE PACKAGE"} <span>{packageData.files.length} {packageData.files.length===1?"file":"files"}</span></h3>{packageData.files.map(file=><a href={savedFileUrl(packageData.ref.revisionId,file.path)} download key={file.path}><File size={14}/><span>{file.path}</span><small>{file.role} · {(file.bytes/1024).toFixed(1)} KB</small><ArrowUpRight size={13}/></a>)}{packageData.dependencies.length>0&&<p className="studio-muted">{packageData.dependencies.length} exact saved {packageData.dependencies.length===1?"revision":"revisions"} linked to this package.</p>}{packageData.revision.state==="conflict"&&<div className="studio-note"><p>This save is preserved separately because the asset changed while you were working.</p><div className="studio-action-row"><button className="studio-button primary" onClick={()=>{setFileDetails(false);setFork(revisionId);}}>Save as new asset</button><button className="studio-button" onClick={()=>asset.current_revision_id&&openRevision(asset.current_revision_id)}><RefreshCw size={13}/> Reload current</button></div></div>}</div>}
      {history&&<div className="asset-history"><h3>Saved revisions</h3>{revisionCursor&&<button className="studio-button" disabled={paging} onClick={()=>void loadMoreRevisions()}>Load older revisions</button>}{revisions.length?revisions.map(revision=><div key={revision.id}><div className="revision-description"><button className="revision-open" disabled={revision.state==="uploading"||busy} onClick={()=>openRevision(revision.id)}><strong>{revision.revision_number?`Revision ${revision.revision_number}`:revision.state==="conflict"?"Preserved conflict":"Upload in progress"}</strong><small>{new Date(revision.created_at).toLocaleString()}</small></button><Markdown className="revision-note" content={revision.message||"Native package"}/></div>{revision.state==="committed"&&revision.id!==asset.current_revision_id&&<button className="studio-button" disabled={busy} onClick={()=>restore(revision.id)}>Restore as new revision</button>}{revision.state==="conflict"&&<button className="studio-button" onClick={()=>{setFileDetails(false);setFork(revision.id);}}>Save as new asset</button>}{revision.state==="uploading"&&<button className="studio-button" onClick={()=>importPackage("revision")}>Resume with original files</button>}</div>):<p className="studio-muted">The first saved revision will appear here.</p>}</div>}</>;
  const simpleImport=intake&&(intake.folder||intake.files.some(file=>nativeImportApp(file.name))||intake.files.every(file=>sourceFormat(file.name)));
  const hasEditor=Boolean((editorUrl||asset?.app_id==="research")&&targetRevision);
  const statusLabel=editorState.error?"Needs attention":/conflict/i.test(editorState.status)?"Conflict preserved":/opening/i.test(editorState.status)?"Opening…":editorState.dirty?(/upload|hash|confirm|prepar|saving/i.test(editorState.status)?"Saving…":"Unsaved"):"Saved";
  return <div className={`project-workspace${hasEditor?" has-editor":""}`}>
    <input ref={filePicker} type="file" multiple hidden aria-label="Choose documents to import" onChange={event=>{receiveFiles(Array.from(event.currentTarget.files??[]));event.currentTarget.value="";}}/>
    <ProjectHeader projectId={projectId} project={project} title={project?<ProjectName id={projectId} name={project.name} onSaved={reload}/>:<h1>Opening project…</h1>} savedRevision={asset&&targetRevision?{assetId:asset.id,revisionId:targetRevision}:undefined} onDashboard={showDashboard}/>
    {(error||notice)&&<div className="project-messages">{error&&<p className="studio-error project-message" role="alert">{error}</p>}{notice&&<div className="studio-success project-message" role="status">{notice}<button className="studio-icon-button" aria-label="Dismiss notice" onClick={()=>setNotice("")}><X size={14}/></button></div>}</div>}
    {asset&&!applicationsOpen&&(launch.pending||launch.error)&&<div className="project-launch-recovery"><LaunchProgress launch={launch} ready={project?.status==="active"} onResume={()=>{if(launch.pendingApp)launchApplication(launch.pendingApp.id);}}/></div>}
    <div className="project-columns">
    <section className={`project-canvas${dropTarget?" project-drop-active":""}`} aria-label="Editor workspace" onDragOver={dragOver} onDragLeave={dragLeave} onDrop={dropFiles}>
      {tabs.length>0&&<div className="project-document-bar">
        <div className="project-tabs" role="group" aria-label="Open assets">{tabs.filter(id=>assets.some(asset=>asset.id===id)).map(id=><div key={id} className={selected===id?"active":""}><button aria-pressed={selected===id} title={assets.find(asset=>asset.id===id)?.name} onClick={()=>select(id)}><File size={12}/><span>{assets.find(asset=>asset.id===id)?.name}</span></button><button className="close-tab" aria-label={`Close ${assets.find(asset=>asset.id===id)?.name}`} onClick={()=>closeTab(id)}><X size={12}/></button></div>)}</div>
        {asset&&<div className="project-document-tools">
          <button ref={applicationsButton} className="studio-tool-button application-launch-button" onClick={()=>setApplicationsOpen(true)} disabled={!project||launch.busy} aria-expanded={applicationsOpen}><Plus size={16}/><span>New file</span></button>
          <DocumentName key={asset.id} asset={asset} onSaved={updated=>setAssets(rows=>rows.map(row=>row.id===updated.id?{...row,...updated}:row))}/>
          {hasEditor&&<span className="project-save-state" data-state={editorState.error?"error":editorState.dirty?"dirty":"saved"} role="status" title={editorState.error||editorState.status} aria-label={`${statusLabel}. ${editorState.status}`}><i aria-hidden="true"/><span>{statusLabel}</span></span>}
          <DropdownMenu><DropdownMenuTrigger asChild><button ref={documentMenuButton} className="studio-tool-button" aria-label="Document options" title="Document options"><MoreHorizontal size={17}/></button></DropdownMenuTrigger><DropdownMenuContent className="studio-tool-menu" align="end">
            <DropdownMenuLabel>{app?.name??`${asset.asset_kind} source`} · {packageData?.revision.revision_number?`Revision ${packageData.revision.revision_number}`:packageData?.revision.state==="conflict"?"Preserved conflict":targetRevision?"Saved native file":"No saved revision"}</DropdownMenuLabel><DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={()=>{setHistory(false);setFileDetails(true);}}><Info size={15}/>File details</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>{setHistory(true);setFileDetails(true);}}><History size={15}/>Revision history</DropdownMenuItem>
            <DropdownMenuItem asChild><Link href={`/dashboard/projects/${projectId}/library/${asset.id}${targetRevision?`?revision=${targetRevision}`:""}`}><Images size={15}/>Exports & downloads</Link></DropdownMenuItem>
            {!sourceMedia&&<DropdownMenuItem onSelect={()=>importPackage("revision")}><Upload size={15}/>Import revision</DropdownMenuItem>}
            {hasEditor&&<DropdownMenuItem asChild><a href="/support#supported-setup" target="_blank" rel="noreferrer"><Info size={15}/>Browser & accessibility help ↗</a></DropdownMenuItem>}
          </DropdownMenuContent></DropdownMenu>
          {hasEditor&&<button className="studio-tool-button" aria-label="Expand editor" title="Expand editor" onClick={()=>embeddedEditor.current?.expand()}><Maximize2 size={15}/></button>}
        </div>}
      </div>}
    {!asset?<div className="project-start">{launcher}</div>:<>
      {asset.app_id==="research"&&targetRevision?<ResearchNotebook ref={embeddedEditor} key={editorEpoch} initialRef={{assetId:asset.id,revisionId:targetRevision}} onState={setEditorState} onDirty={dirty=>{editorDirty.current=dirty;}} onSaved={editorSaved} onRequest={()=>{window.open(`${employeesHref}&view=jobs`,"_blank","noopener");}}/>:editorUrl&&targetRevision?<EmbeddedEditor ref={embeddedEditor} onLibraryChanged={()=>{void reload().catch(error=>setError(error.message));}} onState={setEditorState} key={editorEpoch} projectId={projectId} initialRef={{assetId:asset.id,revisionId:targetRevision}} bundleUrl={editorUrl} name={app?.name??"Creative"} onSaved={editorSaved} onDirty={dirty=>{editorDirty.current=dirty;}}/>:opening?<p role="status" className="studio-empty">Opening the native package…</p>:<div className="asset-preview">{sourceMedia&&<div className="source-import-note"><strong>{asset.name}</strong><p>Saved as reusable source media. Use Place from studio in a compatible Craft to add it to your work.</p><a href={savedFileUrl(revisionId!,packageData?.files.find(file=>file.role==="master")?.path??preview?.path??"")}>Download original</a></div>}{preview?.mimeType.startsWith("image/")?<SavedMedia key={`${revisionId}:${preview.path}`} revisionId={revisionId!} file={preview} name={asset.name}/>:preview&&(preview.mimeType.startsWith("video/")||preview.mimeType.startsWith("audio/"))?<SavedMedia key={`${revisionId}:${preview.path}`} revisionId={revisionId!} file={preview} name={asset.name}/>:<div className="asset-native-placeholder"><AppIcon app={app}/><h2>{asset.name}</h2><p>{packageData?"Your native package is saved.":"Import the native master to create its first saved revision."}</p><p className="studio-muted">{app?.editor.status==="verified"?"The browser editor is ready to connect.":`${app?.name}'s browser integration is being prepared.`}</p></div>}</div>}
      {fileDetails&&<StudioDialog title="Files & revisions." eyebrow={asset.name} close={()=>{setFileDetails(false);setHistory(false);}} returnFocusRef={documentMenuButton}>{assetDetails}</StudioDialog>}
    </>}</section>
    </div>
    {asset&&applicationsOpen&&<StudioDialog title="Your applications." eyebrow={project?.name??"PROJECT"} close={()=>setApplicationsOpen(false)} busy={launch.busy} returnFocusRef={applicationsButton}>{launcher}</StudioDialog>}
    {upload&&<UploadPackageDialog projectId={projectId} asset={upload==="revision"?asset:undefined} close={()=>setUpload(null)} saved={saved} returnFocusRef={upload==="revision"?documentMenuButton:importReturnFocus}/>}
    {intake&&(simpleImport?<ImportDocumentDialog projectId={projectId} initialFiles={intake.files} folder={intake.folder} close={()=>{setIntake(null);void reload().catch(error=>setError(error.message));}} saved={saved} returnFocusRef={importReturnFocus}/>:<UploadPackageDialog projectId={projectId} initialFiles={intake.files} explanation="These files weren’t recognised. Choose an application only for its supported native project format. Export other documents from their original application first." close={()=>setIntake(null)} saved={saved} returnFocusRef={importReturnFocus}/>)}
    {fork&&<StudioDialog title="Another direction." eyebrow="SAVE AS A NEW ASSET" close={()=>setFork(null)} busy={busy}><form onSubmit={forkRevision}><label>Asset name<input name="name" required maxLength={160} defaultValue={`${asset?.name??"Untitled"} — alternate`} autoFocus/></label><p className="studio-muted">The native package and exact dependencies will be preserved in a new asset.</p>{error&&<p role="alert" className="studio-error">{error}</p>}<button className="studio-button primary" disabled={busy}>Save as new asset</button></form></StudioDialog>}
  </div>;
}
