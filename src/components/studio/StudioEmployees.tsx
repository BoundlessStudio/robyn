"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,FileText} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {requireUuid,type AssetRef,type AssetSummary,type ProjectSummary} from "@/studio/assets";
import {studioApps} from "@/studio/apps/registry";
import {isAppReady} from "@/studio/manifest";
import {AppIcon} from "./AppIcon";
import {AssignmentPanel} from "./AssignmentPanel";
import {ResearchBrowserButton} from "./ResearchBrowserButton";
import {StudioStudy} from "./StudioStudy";
import {ProjectSection} from "./ProjectSection";

const views=["Conversation","Jobs","Review","Skills"] as const;
type View=typeof views[number];
const selectedView=(value?:string):View=>views.find(view=>view.toLowerCase()===(value==="assignments"?"jobs":value==="team"?"skills":value))??"Conversation";
interface Selection {projectId:string;assetId:string;revisionId:string}

export function StudioEmployees({projectId,...initial}:{projectId:string;initialAssetId?:string;initialRevisionId?:string;initialView?:string}) {
  return <ProjectSection projectId={projectId}>{project=><ProjectEmployees project={project} {...initial}/>}</ProjectSection>;
}

function ProjectEmployees({project,initialAssetId="",initialRevisionId="",initialView}:{project:ProjectSummary;initialAssetId?:string;initialRevisionId?:string;initialView?:string}) {
  const [selection,setSelection]=useState<Selection>({projectId:project.id,assetId:initialAssetId,revisionId:initialRevisionId});
  const [view,setView]=useState<View>(()=>selectedView(initialView));
  useEffect(()=>{setSelection({projectId:project.id,assetId:initialAssetId,revisionId:initialRevisionId});setView(selectedView(initialView));},[project.id,initialAssetId,initialRevisionId,initialView]);
  function navigate(next:Selection,nextView=view) {
    setSelection(next);setView(nextView);
    const params=new URLSearchParams();
    if(next.assetId)params.set("asset",next.assetId);
    if(next.revisionId)params.set("revision",next.revisionId);
    if(nextView!=="Conversation")params.set("view",nextView.toLowerCase());
    window.history.replaceState(null,"",`/dashboard/projects/${project.id}/employees${params.size?`?${params}`:""}`);
  }
  return <div className="studio-page employees-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR CREATIVE COLLABORATOR</span><h1>Robyn.</h1><p>Share an idea. Follow the work. Review every saved revision.</p></div><div className="studio-action-row"><ResearchBrowserButton projectId={project.id}/><Link href={`/dashboard/projects/${project.id}/settings#studio-budget`} className="studio-button">Manage AI allowance <ArrowUpRight size={15}/></Link></div></header>
    <div className="employees-toolbar"><nav className="employees-views" aria-label="Robyn workspace">{views.map(name=><button key={name} aria-pressed={view===name} onClick={()=>navigate(selection,name)}>{name}</button>)}</nav></div>
    {view==="Skills"?<SkillsDirectory/>:<EmployeeProject key={`${selection.assetId}:${selection.revisionId}`} project={project} selection={selection} view={view} clearInput={()=>navigate({...selection,assetId:"",revisionId:""})}/>}
  </div>;
}

function EmployeeProject({project,selection,view,clearInput}:{project:ProjectSummary;selection:Selection;view:Exclude<View,"Skills">;clearInput:()=>void}) {
  const {projectId,assetId,revisionId}=selection;
  const [context,setContext]=useState<{project:ProjectSummary;asset?:AssetSummary;ref?:AssetRef}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      requireUuid(projectId,"project ID");
      if(project.id!==projectId)throw Error("This project could not be opened.");
      let asset:AssetSummary|undefined,ref:AssetRef|undefined;
      if(assetId||revisionId) {
        requireUuid(assetId,"asset ID");requireUuid(revisionId,"revision ID");
        const [savedAsset,savedRevision]=await Promise.all([
          apiFetch<{asset:AssetSummary}>(`/api/studio/assets/${assetId}`,{signal:controller.signal}),
          apiFetch<{ref:AssetRef}>(`/api/studio/revisions/${revisionId}`,{signal:controller.signal}),
        ]);
        if(savedAsset.asset.id!==assetId||savedAsset.asset.project_id!==projectId||savedRevision.ref.assetId!==assetId||savedRevision.ref.revisionId!==revisionId)throw Error("This saved revision does not belong to the selected project.");
        asset=savedAsset.asset;ref=savedRevision.ref;
      }
      if(!controller.signal.aborted)setContext({project,asset,ref});
    }
    void load().catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[project,projectId,assetId,revisionId]);

  if(error)return <div className="employees-workspace"><p role="alert" className="studio-error">{error}</p>{(assetId||revisionId)&&<button className="studio-button" onClick={clearInput}>Continue without the included file</button>}</div>;
  if(!context)return <p role="status" className="studio-muted">Opening your conversation with Robyn…</p>;
  const openRevision=(ref:AssetRef)=>window.open(`/dashboard/projects/${projectId}?${new URLSearchParams({asset:ref.assetId,revision:ref.revisionId})}`,"_blank","noopener");
  return <section className="employees-workspace" aria-label={`${context.project.name} with Robyn`}>
    {context.ref&&context.asset&&<div className="employees-input"><FileText size={18}/><div><strong>{context.asset.name}</strong><p>This exact saved revision is available to include in your brief. Save any newer editor changes before sharing them.</p></div><button className="studio-button" onClick={()=>openRevision(context.ref!)}>Open saved revision <ArrowUpRight size={14}/></button><button className="studio-button" onClick={clearInput}>Remove file</button></div>}
    {context.project.status==="archived"&&<p className="studio-note">This project is archived. Reactivate it in <Link href={`/dashboard/projects/${projectId}/settings#project-details`}>Settings</Link> before sending a brief.</p>}
    <AssignmentPanel projectId={projectId} mode={view==="Conversation"?"director":view==="Jobs"?"assignments":"review"} canvas={view==="Conversation"} preferredAppId={studioApps.some(app=>app.id===context.asset?.app_id)?context.asset?.app_id??undefined:undefined} selectedRef={context.ref} canAssign={context.project.status==="active"} onOpen={openRevision}/>
  </section>;
}

function SkillsDirectory() {
  return <section aria-label="Robyn’s creative tools">
    <p className="studio-note">Robyn plans, researches with Chrome and Brave Search, and works across these {studioApps.length} creative applications. Open any Craft from your project dashboard to keep editing the saved work yourself.</p>
    <div className="studio-app-grid">{studioApps.map(app=><article key={app.id} className="studio-app-card"><StudioStudy kind={app.artwork} index={app.order}/><div className="studio-craft-caption"><AppIcon app={app}/><small>{app.category}</small></div><h2>{app.name}</h2><p>{app.tagline}</p><span className="studio-status">{isAppReady(app)?"Ready to use":"Creative tools being connected"}</span></article>)}</div>
  </section>;
}
