"use client";
import { savedFileUrl } from "@/studio/saved-file";
import { SavedMedia } from "./SavedMedia";
import { ResearchNotebook } from "./ResearchNotebook";
import { AssignmentPanel } from "./AssignmentPanel";
import { Markdown } from "@/components/Markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, File, X, History, Upload, ArrowUpRight, RefreshCw, MoreHorizontal, Maximize2, PanelLeft, PanelRight, Info } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { apiFetch, readApiError } from "@/lib/api";
import { studioTools as studioApps } from "@/studio/tools";
import type { AssetSummary, ProjectSummary, AssetRef } from "@/studio/assets";
import type { SaveResult } from "@/studio/transfer-client";
import type { EditorSaveResult } from "@/studio/editor-host";
import { UploadPackageDialog } from "./UploadPackageDialog";
import { StudioDialog } from "./StudioDialog";
import { EmbeddedEditor, type EmbeddedEditorHandle, type EditorViewState } from "./EmbeddedEditor";
import { StudioNavigationMenu } from "./StudioNavigationMenu";
import { MediaPanel } from "./MediaPanel";
import { SourceProvenance, SourceCredits, type SourceCredit } from "./SourceProvenance";

interface Activity {id:string;kind:string;created_at:string;details:Record<string,unknown>}
interface Revision {id:string;state:string;revision_number:number|null;message:string;created_at:string}
interface OpenPackage {ref:AssetRef;revision:Revision;files:Array<{path:string;role:string;mimeType:string;bytes:number;downloadUrl:string}>;dependencies:AssetRef[];provenance?:Record<string,unknown>;sourceCredits?:SourceCredit[]}
const panelNames=["Brief","Conversation","Assignments","Activity","Review"] as const;
type Panel=typeof panelNames[number];
// Candidate bundles can be reviewed together without promoting their manifests.
const previewEditors:Record<string,string>=process.env.NODE_ENV==="development"?JSON.parse(process.env.NEXT_PUBLIC_EDITOR_PREVIEW_URLS??"{}"):{};

export function ProjectWorkspace({projectId,initialAssetId}:{projectId:string;initialAssetId?:string}) {
  const [project,setProject]=useState<ProjectSummary|null>(null);const [assets,setAssets]=useState<AssetSummary[]>([]);const [activity,setActivity]=useState<Activity[]>([]);
  const [selected,setSelected]=useState(initialAssetId??"");const [tabs,setTabs]=useState<string[]>(initialAssetId?[initialAssetId]:[]);const [panel,setPanel]=useState<Panel>("Brief");
  const [brief,setBrief]=useState("");const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
  const [upload,setUpload]=useState<"new"|"revision"|null>(null);const [revisions,setRevisions]=useState<Revision[]>([]);const [history,setHistory]=useState(false);
  const [packageData,setPackageData]=useState<OpenPackage|null>(null);const [opening,setOpening]=useState(false);const [revisionId,setRevisionId]=useState<string|null>(null);
  const [focusedRevision,setFocusedRevision]=useState<AssetRef|null>(null);
  const [researchHandoff,setResearchHandoff]=useState(0);
  const [fileDetails,setFileDetails]=useState(false);const [projectPanelOpen,setProjectPanelOpen]=useState(false);
  const [fork,setFork]=useState<string|null>(null);const [panelWidth,setPanelWidth]=useState(320);
  const [assetsCollapsed,setAssetsCollapsed]=useState(false);
  const [mediaOpen,setMediaOpen]=useState(false);
  const [assetCursor,setAssetCursor]=useState<string|null>(null),[revisionCursor,setRevisionCursor]=useState<string|null>(null),[paging,setPaging]=useState(false);
  const selectedNow=useRef(selected);selectedNow.current=selected;
  const embeddedEditor=useRef<EmbeddedEditorHandle>(null);
  const documentMenuButton=useRef<HTMLButtonElement>(null);
  const [editorState,setEditorState]=useState<EditorViewState>({status:"Opening editor…",dirty:false,error:""});
  const editorDirty=useRef(false);const [editorEpoch,setEditorEpoch]=useState(0);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),6500);return()=>window.clearTimeout(timer);},[notice]);
  useEffect(()=>{
    const url=new URL(window.location.href);
    if(selected)url.searchParams.set("asset",selected);else url.searchParams.delete("asset");
    if(url.href!==window.location.href)window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  },[selected]);
  const asset=assets.find(row=>row.id===selected);const app=studioApps.find(app=>app.id===asset?.app_id);
  const previewEditorUrl=process.env.NODE_ENV==="development"&&app?(app.id===process.env.NEXT_PUBLIC_EDITOR_PREVIEW_APP?process.env.NEXT_PUBLIC_EDITOR_PREVIEW_URL:previewEditors[app.id]):null;
  const editorUrl=previewEditorUrl??(app?.editor.status==="verified"?app.editor.bundleUrl:null);
  const targetRevision=focusedRevision&&focusedRevision.assetId===asset?.id?focusedRevision.revisionId:asset?.current_revision_id;
  const reload=useCallback(async()=>{const data=await apiFetch<{project:ProjectSummary;assets:AssetSummary[];activity:Activity[];nextAssetCursor:string|null}>(`/api/studio/projects/${projectId}`);
    const selectedId=selectedNow.current;
    if(selectedId&&!data.assets.some(row=>row.id===selectedId)){const extra=await apiFetch<{asset:AssetSummary}>(`/api/studio/assets/${selectedId}`);if(extra.asset.project_id===projectId)data.assets.push(extra.asset);}
    setProject(data.project);setAssets(previous=>[...new Map([...previous,...data.assets].map(row=>[row.id,row])).values()]);setAssetCursor(data.nextAssetCursor);setActivity(data.activity);return data;},[projectId]);
  async function loadMoreAssets(){if(!assetCursor||paging)return;setPaging(true);try{const data=await apiFetch<{assets:AssetSummary[];nextCursor:string|null}>(`/api/studio/assets?projectId=${projectId}&cursor=${encodeURIComponent(assetCursor)}`);setAssets(previous=>[...new Map([...previous,...data.assets].map(row=>[row.id,row])).values()]);setAssetCursor(data.nextCursor);}catch(error){setError((error as Error).message);}finally{setPaging(false);}}
  async function loadMoreRevisions(){if(!revisionCursor||!asset||paging)return;setPaging(true);const assetId=asset.id;try{const data=await apiFetch<{revisions:Revision[];nextCursor:string|null}>(`/api/studio/assets/${assetId}/revisions?cursor=${encodeURIComponent(revisionCursor)}`);if(selectedNow.current!==assetId)return;setRevisions(previous=>[...new Map([...previous,...data.revisions].map(row=>[row.id,row])).values()]);setRevisionCursor(data.nextCursor);}catch(error){setError((error as Error).message);}finally{setPaging(false);}}
  useEffect(()=>{let live=true;reload().then(data=>{if(live)setBrief(data.project.brief);}).catch(error=>{if(live)setError(error.message);});return()=>{live=false;};},[reload]);
  useEffect(()=>{
    let live=true;setPackageData(null);setRevisions([]);setRevisionCursor(null);
    const target=focusedRevision?.assetId===asset?.id?focusedRevision?.revisionId:asset?.current_revision_id;
    setRevisionId(target??null);
    if(!asset){setOpening(false);return;}
    apiFetch<{revisions:Revision[];nextCursor:string|null}>(`/api/studio/assets/${asset.id}/revisions`).then(data=>{if(live){setRevisions(data.revisions);setRevisionCursor(data.nextCursor);}}).catch(error=>{if(live)setError(error.message);});
    if(target){setOpening(true);apiFetch<OpenPackage>(`/api/studio/revisions/${target}`).then(data=>{if(live)setPackageData(data);}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setOpening(false);});}
    else setOpening(false);
    return()=>{live=false;};
  },[asset?.id,asset?.current_revision_id,focusedRevision]);
  function leaveEditor(){return !editorDirty.current||window.confirm("This editor has unsaved work. Leave without saving?");}
  function select(id:string){if(id===selected){return;}if(!leaveEditor())return;setEditorEpoch(value=>value+1);setSelected(id);setTabs(current=>current.includes(id)?current:[...current,id]);setFocusedRevision(null);setError("");setHistory(false);setFileDetails(false);}
  function closeTab(id:string){if(id===selected&&!leaveEditor())return;setTabs(current=>current.filter(tab=>tab!==id));if(selected===id){setEditorEpoch(value=>value+1);setFocusedRevision(null);setSelected(tabs.find(tab=>tab!==id)??"");}}
  function importPackage(mode:"new"|"revision"){if(leaveEditor())setUpload(mode);}
  async function saved(result:SaveResult){
    setEditorEpoch(value=>value+1);
    setFileDetails(result.status==="conflict");
    setUpload(null);setFocusedRevision(result);setSelected(result.assetId);setTabs(current=>current.includes(result.assetId)?current:[...current,result.assetId]);setHistory(result.status==="conflict");
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
  async function saveBrief(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{await apiFetch(`/api/studio/projects/${projectId}`,{method:"PATCH",body:JSON.stringify({brief})});await reload();setNotice("Project brief saved.");}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function restore(id:string){if(!asset||!leaveEditor())return;setBusy(true);setError("");try{const response=await fetch(`/api/studio/assets/${asset.id}/restore`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revisionId:id,expectedBaseRevisionId:asset.current_revision_id})});if(!response.ok&&response.status!==409)throw new Error(await readApiError(response,"Could not restore"));const result=await response.json() as SaveResult;if(!result.status)throw new Error("The revision could not be restored.");await saved(result);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function forkRevision(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!fork||!leaveEditor())return;const data=new FormData(event.currentTarget);setBusy(true);try{const result=await apiFetch<SaveResult>(`/api/studio/revisions/${fork}/fork`,{method:"POST",body:JSON.stringify({name:data.get("name")})});setFork(null);await saved(result);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function archive(){if(!project)return;setBusy(true);try{await apiFetch(`/api/studio/projects/${projectId}`,{method:"PATCH",body:JSON.stringify({status:project.status==="active"?"archived":"active"})});await reload();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function openAssignmentAsset(ref:{assetId:string;revisionId:string}) {
    if(!leaveEditor())return;
    try{
      selectedNow.current=ref.assetId;await reload();setEditorEpoch(value=>value+1);setSelected(ref.assetId);setFocusedRevision(ref);
      setTabs(current=>current.includes(ref.assetId)?current:[...current,ref.assetId]);setError("");
    }catch(error){setError((error as Error).message);}
  }
  const sourceMedia=Boolean(asset?.asset_kind&&asset.asset_kind!=="native");
  const preview=sourceMedia&&asset?.asset_kind!=="image"?(packageData?.files.find(file=>file.role==="export"&&file.mimeType.startsWith(`${asset?.asset_kind}/`))??packageData?.files.find(file=>file.role==="master")):packageData?.files.find(file=>file.role==="preview");
  const assetDetails = asset&&<>{packageData&&<div className="asset-package"><SourceProvenance provenance={packageData.provenance}/><SourceCredits credits={packageData.sourceCredits}/><h3>{sourceMedia?"SOURCE MEDIA":"NATIVE PACKAGE"} <span>{packageData.files.length} {packageData.files.length===1?"file":"files"}</span></h3>{packageData.files.map(file=><a href={savedFileUrl(packageData.ref.revisionId,file.path)} download key={file.path}><File size={14}/><span>{file.path}</span><small>{file.role} · {(file.bytes/1024).toFixed(1)} KB</small><ArrowUpRight size={13}/></a>)}{packageData.dependencies.length>0&&<p className="studio-muted">{packageData.dependencies.length} exact saved {packageData.dependencies.length===1?"revision":"revisions"} linked to this package.</p>}{packageData.revision.state==="conflict"&&<div className="studio-note"><p>This save is preserved separately because the asset changed while you were working.</p><div className="studio-action-row"><button className="studio-button primary" onClick={()=>{setFileDetails(false);setFork(revisionId);}}>Save as new asset</button><button className="studio-button" onClick={()=>asset.current_revision_id&&openRevision(asset.current_revision_id)}><RefreshCw size={13}/> Reload current</button></div></div>}</div>}
      {history&&<div className="asset-history"><h3>Saved revisions</h3>{revisionCursor&&<button className="studio-button" disabled={paging} onClick={()=>void loadMoreRevisions()}>Load older revisions</button>}{revisions.length?revisions.map(revision=><div key={revision.id}><div className="revision-description"><button className="revision-open" disabled={revision.state==="uploading"||busy} onClick={()=>openRevision(revision.id)}><strong>{revision.revision_number?`Revision ${revision.revision_number}`:revision.state==="conflict"?"Preserved conflict":"Upload in progress"}</strong><small>{new Date(revision.created_at).toLocaleString()}</small></button><Markdown className="revision-note" content={revision.message||"Native package"}/></div>{revision.state==="committed"&&revision.id!==asset.current_revision_id&&<button className="studio-button" disabled={busy} onClick={()=>restore(revision.id)}>Restore as new revision</button>}{revision.state==="conflict"&&<button className="studio-button" onClick={()=>{setFileDetails(false);setFork(revision.id);}}>Save as new asset</button>}{revision.state==="uploading"&&<button className="studio-button" onClick={()=>importPackage("revision")}>Resume with original files</button>}</div>):<p className="studio-muted">The first saved revision will appear here.</p>}</div>}</>;
  const projectDetails = <aside className="project-details" aria-label="Project brief and activity"><div className="project-panel-title"><span>PROJECT</span><button className="studio-tool-button" aria-label="Close project panels" onClick={()=>setProjectPanelOpen(false)}><X size={14}/></button></div><div className="project-detail-tabs" aria-label="Project panels">{panelNames.map(name=><button key={name} aria-pressed={panel===name} onClick={()=>setPanel(name)}>{name}</button>)}</div><div className="project-detail-content">{panel==="Brief"&&<><span className="studio-eyebrow">THE CREATIVE DIRECTION</span><h2>Start with a feeling.<br/>Give it a brief.</h2><form className="studio-form" onSubmit={saveBrief}><label>Project brief<textarea value={brief} onChange={event=>setBrief(event.target.value)} rows={12} maxLength={20000} placeholder="What are we making? Who is it for? What should it feel like?"/></label><button className="studio-button primary" disabled={!project||busy}>{busy?"Saving…":"Save brief"}</button></form><div className="project-archive"><p>Keep your finished work close.</p><button className="studio-button" onClick={archive} disabled={!project||busy}>{project?.status==="archived"?"Reactivate project":"Archive project"}</button></div></>}{panel==="Activity"&&<><h2>The work, as it happens.</h2>{activity.length?<ol className="project-activity">{activity.map(event=><li key={event.id}><strong>{event.kind==="revision.committed"?"A new revision was saved":event.kind==="revision.conflict"?"A conflicting save was preserved":event.kind==="asset.forked"?"A revision became a new asset":event.kind}</strong><small>{new Date(event.created_at).toLocaleString()}</small></li>)}</ol>:<p className="studio-muted">Saves and creative handoffs will appear here.</p>}</>}{panel==="Conversation"&&<AssignmentPanel projectId={projectId} mode="director" selectedRef={asset&&revisionId?{assetId:asset.id,revisionId}:undefined} onOpen={openAssignmentAsset}/>}{panel==="Assignments"&&<AssignmentPanel projectId={projectId} key={`assignments-${researchHandoff}`} mode="assignments" preferredAppId={app?.id==="research"?"research":undefined} selectedRef={asset&&revisionId?{assetId:asset.id,revisionId}:undefined} onOpen={openAssignmentAsset}/>}{panel==="Review"&&<AssignmentPanel projectId={projectId} mode="review" onOpen={openAssignmentAsset}/>}</div><label className="project-resize">Panel width<input type="range" min={260} max={460} step={10} value={panelWidth} onChange={event=>setPanelWidth(Number(event.target.value))}/></label></aside>;
  const assetBrowser = <aside className="project-assets" aria-label="Asset browser"><div className="project-panel-heading"><h2>Project assets</h2><span>{assets.length}</span></div>{assets.length?<nav aria-label="Project assets">{assets.map(item=><button key={item.id} aria-pressed={selected===item.id} onClick={()=>select(item.id)}><span className="asset-mini" style={{background:studioApps.find(app=>app.id===item.app_id)?.color}} aria-hidden="true">{studioApps.find(app=>app.id===item.app_id)?.monogram??item.asset_kind?.slice(0,2).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.current_revision_id?(item.asset_kind&&item.asset_kind!=="native"?`${item.asset_kind} source`:item.app_id==="research"?"Saved research notebook":"Saved native file"):"Awaiting first save"}</small></span></button>)}</nav>:<p className="studio-muted">The work will live here.<br/>Add a native file to begin.</p>}{assetCursor&&<button className="studio-button" disabled={paging} onClick={()=>void loadMoreAssets()}>Load more assets</button>}<button className="project-add" onClick={()=>importPackage("new")} disabled={!project}><Plus size={15}/> Add native package</button></aside>;
  const hasEditor=Boolean((editorUrl||app?.kind==="research")&&targetRevision);
  const statusLabel=editorState.error?"Needs attention":/conflict/i.test(editorState.status)?"Conflict preserved":/opening/i.test(editorState.status)?"Opening…":editorState.dirty?(/upload|hash|confirm|prepar|saving/i.test(editorState.status)?"Saving…":"Unsaved"):"Saved";
  return <div className={`project-workspace${hasEditor?" has-editor":""}${assetsCollapsed?" assets-collapsed":""}${projectPanelOpen?" panels-open":""}`} style={{"--project-panel-width":`${panelWidth}px`} as React.CSSProperties}>
    <header className="project-header">
      <StudioNavigationMenu/>
      <Link className="project-back" href="/dashboard" aria-label="Back to projects" title="Back to projects"><ArrowLeft size={15}/></Link>
      <h1 title={project?.name}>{project?.name??"Opening project…"}</h1>
      {project?.status==="archived"&&<span className="project-archive-label">Archived</span>}
      <div className="project-header-actions">
        <a className="studio-tool-button" href="/dashboard/settings#studio-budget" target="_blank" rel="noreferrer">AI budget ↗</a>
        <button className="studio-tool-button" onClick={()=>setMediaOpen(true)} disabled={!project} aria-label="Stock and generated media">Media</button>
        <button className="studio-tool-button" aria-label="Project assets" title="Project assets" aria-expanded={!assetsCollapsed} onClick={()=>setAssetsCollapsed(value=>!value)}><PanelLeft size={16}/><span>Assets</span></button>
        <button className="studio-tool-button" aria-label="Project panels" title="Brief, conversation, assignments and review" aria-expanded={projectPanelOpen} onClick={()=>setProjectPanelOpen(value=>!value)}><PanelRight size={16}/><span>Project panels</span></button>
        <button className="studio-tool-button" aria-label="Add asset" title="Add asset" onClick={()=>importPackage("new")} disabled={!project}><Plus size={16}/><span>Add asset</span></button>
      </div>
    </header>
    {(error||notice)&&<div className="project-messages">{error&&<p className="studio-error project-message" role="alert">{error}</p>}{notice&&<div className="studio-success project-message" role="status">{notice}<button className="studio-icon-button" aria-label="Dismiss notice" onClick={()=>setNotice("")}><X size={14}/></button></div>}</div>}
    <div className="project-columns">{assetBrowser}
    <section className="project-canvas" aria-label="Editor workspace">
      <div className="project-document-bar">
        <div className="project-tabs" role="group" aria-label="Open assets">{tabs.filter(id=>assets.some(asset=>asset.id===id)).map(id=><div key={id} className={selected===id?"active":""}><button aria-pressed={selected===id} title={assets.find(asset=>asset.id===id)?.name} onClick={()=>select(id)}><File size={12}/><span>{assets.find(asset=>asset.id===id)?.name}</span></button><button className="close-tab" aria-label={`Close ${assets.find(asset=>asset.id===id)?.name}`} onClick={()=>closeTab(id)}><X size={12}/></button></div>)}</div>
        {asset&&<div className="project-document-tools">
          {hasEditor&&<span className="project-save-state" data-state={editorState.error?"error":editorState.dirty?"dirty":"saved"} role="status" title={editorState.error||editorState.status} aria-label={`${statusLabel}. ${editorState.status}`}><i aria-hidden="true"/><span>{statusLabel}</span></span>}
          <DropdownMenu><DropdownMenuTrigger asChild><button ref={documentMenuButton} className="studio-tool-button" aria-label="Document options" title="Document options"><MoreHorizontal size={17}/></button></DropdownMenuTrigger><DropdownMenuContent className="studio-tool-menu" align="end">
            <DropdownMenuLabel>{app?.name} · {packageData?.revision.revision_number?`Revision ${packageData.revision.revision_number}`:packageData?.revision.state==="conflict"?"Preserved conflict":targetRevision?"Saved native file":"No saved revision"}</DropdownMenuLabel><DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={()=>{setHistory(false);setFileDetails(true);}}><Info size={15}/>File details</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>{setHistory(true);setFileDetails(true);}}><History size={15}/>Revision history</DropdownMenuItem>
            {!sourceMedia&&<DropdownMenuItem onSelect={()=>importPackage("revision")}><Upload size={15}/>Import revision</DropdownMenuItem>}
            {hasEditor&&<DropdownMenuItem asChild><a href="/support#supported-setup" target="_blank" rel="noreferrer"><Info size={15}/>Browser & accessibility help ↗</a></DropdownMenuItem>}
          </DropdownMenuContent></DropdownMenu>
          {hasEditor&&<button className="studio-tool-button" aria-label="Expand editor" title="Expand editor" onClick={()=>embeddedEditor.current?.expand()}><Maximize2 size={15}/></button>}
        </div>}
      </div>
    {!asset?<div className="project-blank"><span className="project-big-orbit" aria-hidden="true">✳</span><span className="studio-eyebrow">A LITTLE SPACE FOR POSSIBILITY</span><h2>Every great thing<br/>starts <em>somewhere.</em></h2><p>Shape your brief, bring in a native file,<br/>and give your next idea room to grow.</p><button className="studio-button primary" onClick={()=>importPackage("new")} disabled={!project}>Bring in your first asset <ArrowUpRight size={15}/></button></div>:<>
      {app?.kind==="research"&&targetRevision?<ResearchNotebook ref={embeddedEditor} key={editorEpoch} initialRef={{assetId:asset.id,revisionId:targetRevision}} onState={setEditorState} onDirty={dirty=>{editorDirty.current=dirty;}} onSaved={editorSaved} onRequest={()=>{setResearchHandoff(value=>value+1);setPanel("Assignments");setProjectPanelOpen(true);}}/>:editorUrl&&targetRevision?<EmbeddedEditor ref={embeddedEditor} onState={setEditorState} key={editorEpoch} projectId={projectId} initialRef={{assetId:asset.id,revisionId:targetRevision}} bundleUrl={editorUrl} name={app?.name??"Creative"} onSaved={editorSaved} onDirty={dirty=>{editorDirty.current=dirty;}}/>:opening?<p role="status" className="studio-empty">Opening the native package…</p>:<div className="asset-preview">{preview?.mimeType.startsWith("image/")?<SavedMedia key={`${revisionId}:${preview.path}`} revisionId={revisionId!} file={preview} name={asset.name}/>:preview&&(preview.mimeType.startsWith("video/")||preview.mimeType.startsWith("audio/"))?<SavedMedia key={`${revisionId}:${preview.path}`} revisionId={revisionId!} file={preview} name={asset.name}/>:<div className="asset-native-placeholder"><span style={{background:app?.color}} aria-hidden="true">{app?.monogram}</span><h2>{asset.name}</h2><p>{packageData?"Your native package is saved.":"Import the native master to create its first saved revision."}</p><p className="studio-muted">{app?.editor.status==="verified"?"The browser editor is ready to connect.":`${app?.name}'s browser integration is being prepared.`}</p></div>}</div>}
      {fileDetails&&<StudioDialog title="Files & revisions." eyebrow={asset.name} close={()=>{setFileDetails(false);setHistory(false);}} returnFocusRef={documentMenuButton}>{assetDetails}</StudioDialog>}
    </>}</section>
    {projectPanelOpen&&projectDetails}</div>
    {mediaOpen&&<MediaPanel key={projectId} projectId={projectId} assets={assets} close={()=>setMediaOpen(false)} onSaved={reload} onOpen={openAssignmentAsset}/>}
    {upload&&<UploadPackageDialog projectId={projectId} asset={upload==="revision"?asset:undefined} close={()=>setUpload(null)} saved={saved} returnFocusRef={upload==="revision"?documentMenuButton:undefined}/>}
    {fork&&<StudioDialog title="Another direction." eyebrow="SAVE AS A NEW ASSET" close={()=>setFork(null)} busy={busy}><form onSubmit={forkRevision}><label>Asset name<input name="name" required maxLength={160} defaultValue={`${asset?.name??"Untitled"} — alternate`} autoFocus/></label><p className="studio-muted">The native package and exact dependencies will be preserved in a new asset.</p>{error&&<p role="alert" className="studio-error">{error}</p>}<button className="studio-button primary" disabled={busy}>Save as new asset</button></form></StudioDialog>}
  </div>;
}
