"use client";

import {useRef,useState} from "react";
import Link from "next/link";
import {Search,ArrowUpRight,Upload,FolderOpen,Images,LayoutGrid,List} from "lucide-react";
import {studioTools} from "@/studio/tools";
import type {AssetSummary,ProjectSummary} from "@/studio/assets";
import {nativeImportApp} from "@/studio/native-import";
import {sourceFormat} from "@/studio/source-import";
import {apiFetch} from "@/lib/api";
import {AppIcon} from "./AppIcon";
import {usePagedStudioList} from "./usePagedStudioList";
import {ImportDocumentDialog} from "./ImportDocumentDialog";
import {UploadPackageDialog} from "./UploadPackageDialog";
import {MediaPanel} from "./MediaPanel";
import {ProjectSection} from "./ProjectSection";

export function StudioLibrary({projectId}:{projectId:string}) {
  return <ProjectSection projectId={projectId}>{project=><ProjectLibrary project={project}/>}</ProjectSection>;
}

function ProjectLibrary({project}:{project:ProjectSummary}) {
  const projectId=project.id;
  const [search,setSearch]=useState(""),[kind,setKind]=useState(""),[appId,setAppId]=useState("");
  const [view,setView]=useState<"grid"|"list">("grid"),[notice,setNotice]=useState("");
  const [intake,setIntake]=useState<{files:File[];folder:boolean}|null>(null),[media,setMedia]=useState<{projectId:string;assets:AssetSummary[]}|null>(null);
  const [loadingMedia,setLoadingMedia]=useState(false),[mediaError,setMediaError]=useState("");
  const input=useRef<HTMLInputElement>(null),importButton=useRef<HTMLButtonElement>(null);
  const params=new URLSearchParams({q:search,projectId,...(kind?{kind}:{}),...(appId?{appId}:{})});
  const library=usePagedStudioList<AssetSummary>(`/api/studio/assets?${params}`,"assets");
  const writable=project.status==="active";
  async function imported(){setIntake(null);setNotice("Your files are saved in the asset library.");await library.reload();}
  async function showMedia(id=projectId){
    if(!id||loadingMedia)return;setLoadingMedia(true);setMediaError("");
    try{
      const assets:AssetSummary[]=[],seen=new Set<string>();let cursor:string|null=null;
      do{
        const page:{assets:AssetSummary[];nextCursor:string|null}=await apiFetch(`/api/studio/assets?${new URLSearchParams({projectId:id,kind:"image",...(cursor?{cursor}:{})})}`);
        assets.push(...page.assets);cursor=page.nextCursor;
        if(cursor&&seen.has(cursor))throw Error("The source images could not finish loading. Try again.");if(cursor)seen.add(cursor);
      }while(cursor);
      setMedia({projectId:id,assets});
    }catch(reason){setMediaError((reason as Error).message);}finally{setLoadingMedia(false);}
  }
  const simple=intake&&(intake.folder||intake.files.some(file=>nativeImportApp(file.name))||intake.files.every(file=>sourceFormat(file.name)));
  return <div className="studio-page library-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR PROJECT LIBRARY</span><h1>Assets.</h1><p>Bring files in. Keep your versions together. Take your work anywhere.</p></div><div className="studio-action-row">
      <button ref={importButton} className="studio-button primary" disabled={!writable} onClick={()=>input.current?.click()}><Upload size={15}/>Import files</button>
    </div></header>
    <input ref={input} type="file" multiple hidden aria-label="Import assets" onChange={event=>{const files=Array.from(event.currentTarget.files??[]);if(files.length)setIntake({files,folder:false});event.currentTarget.value="";}}/>
    <div className="library-filters">
      <label>Type<select aria-label="Filter by asset type" value={kind} onChange={event=>setKind(event.target.value)}><option value="">All types</option><option value="native">Native documents</option><option value="image">Images</option><option value="audio">Audio</option><option value="video">Video</option></select></label>
      <label>Application<select aria-label="Filter by application" value={appId} onChange={event=>setAppId(event.target.value)}><option value="">All applications</option>{studioTools.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
      <label className="studio-search"><Search size={16}/><input aria-label="Search assets" placeholder="Search your library" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    </div>
    <div className="studio-toolbar library-actions"><div><div className="studio-action-row"><button className="studio-button" disabled={!writable} onClick={()=>setIntake({files:[],folder:true})}><FolderOpen size={15}/>Import a folder</button><button className="studio-button" disabled={!writable||loadingMedia} onClick={()=>void showMedia()}><Images size={15}/>{loadingMedia?"Loading source images…":"Find or generate media"}</button></div></div><div className="library-view"><span className="studio-muted">{library.rows.length}{library.nextCursor?"+":""} assets</span><button aria-label="Grid view" aria-pressed={view==="grid"} onClick={()=>setView("grid")}><LayoutGrid size={17}/></button><button aria-label="List view" aria-pressed={view==="list"} onClick={()=>setView("list")}><List size={17}/></button></div></div>
    {mediaError&&<p role="alert" className="studio-error">{mediaError}</p>}
    {notice&&<p role="status" className="studio-success">{notice}</p>}
    {library.error&&<p role="alert" className="studio-error">{library.error}</p>}
    {library.loading&&!library.rows.length?<p role="status" className="studio-muted">Loading your library…</p>:library.rows.length?<div className={view==="grid"?"studio-library-grid":"library-list"}>{library.rows.map(asset=>{const app=studioTools.find(app=>app.id===asset.app_id);return <Link className="studio-library-piece" href={`/dashboard/projects/${projectId}/library/${asset.id}`} key={asset.id}>
      <div className="library-art">{asset.preview_url?<img src={asset.preview_url} alt="" loading="lazy"/>:app?<AppIcon app={app} className="library-app-icon"/>:<span className="library-file-mark">{asset.asset_kind?.slice(0,2).toUpperCase()}</span>}</div>
      <div className="library-piece-info"><div className="library-piece-heading"><h2>{asset.name}</h2><ArrowUpRight size={18}/></div><p>{asset.project?.name??project?.name??"Project"}</p><small>{app?.name??`${asset.asset_kind} source`} · {asset.current_revision_id?"Saved":"Awaiting first save"}</small></div>
    </Link>;})}</div>:<div className="library-empty-message"><Images size={32}/><h2>{search||kind||appId?"No matching assets.":"Make room for your next idea."}</h2><p>{search||kind||appId?"Try another search or filter.":"Import native projects, images, audio or video. Open an asset to rename it, manage versions or download its files."}</p></div>}
    {library.nextCursor&&<button className="studio-button library-load-more" disabled={library.loading} onClick={()=>void library.loadMore()}>Load more assets</button>}
    {intake&&(simple?<ImportDocumentDialog projectId={projectId} initialFiles={intake.files} folder={intake.folder} close={()=>{setIntake(null);void library.reload();}} saved={imported} returnFocusRef={importButton}/>:<UploadPackageDialog projectId={projectId} initialFiles={intake.files} close={()=>setIntake(null)} saved={imported} returnFocusRef={importButton}/>)}
    {media&&<MediaPanel projectId={media.projectId} assets={media.assets} close={()=>setMedia(null)} onSaved={async()=>{await library.reload();await showMedia(media.projectId);}} onOpen={async ref=>{window.location.assign(`/dashboard/projects/${projectId}/library/${ref.assetId}?revision=${ref.revisionId}`);}}/>}
  </div>;
}
