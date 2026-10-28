"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,FileText} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {requireUuid,type AssetRef,type AssetSummary,type ProjectSummary} from "@/studio/assets";
import {studioTools as studioApps} from "@/studio/tools";
import {creativeDirector} from "@/studio/director";
import {isEmployeeReady} from "@/studio/manifest";
import {AppIcon} from "./AppIcon";
import {AssignmentPanel} from "./AssignmentPanel";
import {ResearchBrowserButton} from "./ResearchBrowserButton";
import {StudioStudy} from "./StudioStudy";
import {ProjectSection} from "./ProjectSection";

const views=["Conversation","Assignments","Review","Team"] as const;
type View=typeof views[number];
const selectedView=(value?:string):View=>views.find(view=>view.toLowerCase()===value)??"Conversation";
interface Selection {projectId:string;assetId:string;revisionId:string}
interface Employee {id:string;kind:"director"|"specialist";app_id:string|null;role:string;provision_state:string}

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
    <header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR CREATIVE COMPANY</span><h1>AI Employees.</h1><p>Brief your team. Follow the work. Review every saved revision.</p></div><Link href="/dashboard/settings#studio-budget" className="studio-button">Manage AI budget <ArrowUpRight size={15}/></Link></header>
    <div className="employees-toolbar"><nav className="employees-views" aria-label="Employee workspace">{views.map(name=><button key={name} aria-pressed={view===name} onClick={()=>navigate(selection,name)}>{name}</button>)}</nav></div>
    {view==="Team"?<EmployeeDirectory projectId={project.id}/>:<EmployeeProject key={`${selection.assetId}:${selection.revisionId}`} project={project} selection={selection} view={view} clearInput={()=>navigate({...selection,assetId:"",revisionId:""})}/>}
  </div>;
}

function EmployeeProject({project,selection,view,clearInput}:{project:ProjectSummary;selection:Selection;view:Exclude<View,"Team">;clearInput:()=>void}) {
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
  if(!context)return <p role="status" className="studio-muted">Opening your project team…</p>;
  const openRevision=(ref:AssetRef)=>window.open(`/dashboard/projects/${projectId}?${new URLSearchParams({asset:ref.assetId,revision:ref.revisionId})}`,"_blank","noopener");
  return <section className="employees-workspace" aria-label={`${context.project.name} employees`}>
    {context.ref&&context.asset&&<div className="employees-input"><FileText size={18}/><div><strong>{context.asset.name}</strong><p>This exact saved revision is available to include in your brief. Save any newer editor changes before sharing them.</p></div><button className="studio-button" onClick={()=>openRevision(context.ref!)}>Open saved revision <ArrowUpRight size={14}/></button><button className="studio-button" onClick={clearInput}>Remove file</button></div>}
    {context.project.status==="archived"&&<p className="studio-note">This project is archived. Reactivate it in Project details before sending a brief.</p>}
    <AssignmentPanel projectId={projectId} mode={view==="Conversation"?"director":view==="Assignments"?"assignments":"review"} canvas={view==="Conversation"} preferredAppId={context.asset?.app_id??undefined} selectedRef={context.ref} canAssign={context.project.status==="active"} onOpen={openRevision}/>
  </section>;
}

function EmployeeDirectory({projectId}:{projectId:string}) {
  const [employees,setEmployees]=useState<Employee[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    apiFetch<{employees:Employee[]}>("/api/studio/bootstrap",{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setEmployees([...data.employees].sort((a,b)=>(a.kind==="director"?-1:studioApps.find(app=>app.id===a.app_id)?.order??99)-(b.kind==="director"?-1:studioApps.find(app=>app.id===b.app_id)?.order??99)));}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);
  return <section aria-label="Your creative team">
    <p className="studio-note">A Creative Director, Research, and a dedicated specialist for every Craft. Your team works with saved files and brings each new revision back for review.</p>
    {error&&<p role="alert" className="studio-error">{error}</p>}
    {loading?<p role="status" className="studio-muted">Meeting your team…</p>:<div className="studio-app-grid">{employees.map(employee=>{
      const app=studioApps.find(app=>app.id===employee.app_id),director=employee.kind==="director";
      return <article key={employee.id} className="studio-app-card"><StudioStudy kind={director?"director":app?.artwork} index={director?0:app?.order}/><div className="studio-craft-caption">{director?<span>{creativeDirector.monogram}</span>:<AppIcon app={app}/>}<small>{director?"DIRECTION":app?.category}</small></div><h2>{employee.role}</h2><h3>{director?"Creative direction & coordination":app?.name}</h3><p>{director?"Turns your brief into a creative direction, brings the specialists together, and returns final work for your review.":app?.tagline}</p><span className="studio-status">{employee.provision_state==="ready"?"Workstation connected":employee.provision_state==="provisioning"?"Preparing workstation":employee.provision_state==="failed"?"Setup needs attention":(director||(app&&isEmployeeReady(app)))?"Ready for your first brief":"Creative tools being connected"}</span>{app?.id==="research"&&<ResearchBrowserButton projectId={projectId}/>}</article>;
    })}</div>}
  </section>;
}
