"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,FileText,Users} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {requireUuid,type AssetRef,type AssetSummary,type ProjectSummary} from "@/studio/assets";
import {studioTools as studioApps} from "@/studio/tools";
import {creativeDirector} from "@/studio/director";
import {isEmployeeReady} from "@/studio/manifest";
import {AppIcon} from "./AppIcon";
import {AssignmentPanel} from "./AssignmentPanel";
import {ResearchBrowserButton} from "./ResearchBrowserButton";
import {StudioStudy} from "./StudioStudy";
import {usePagedStudioList} from "./usePagedStudioList";

const views=["Conversation","Assignments","Review","Team"] as const;
type View=typeof views[number];
const selectedView=(value?:string):View=>views.find(view=>view.toLowerCase()===value)??"Conversation";
interface Selection {projectId:string;assetId:string;revisionId:string}
interface Employee {id:string;kind:"director"|"specialist";app_id:string|null;role:string;provision_state:string}

export function StudioEmployees({initialProjectId="",initialAssetId="",initialRevisionId="",initialView}:{initialProjectId?:string;initialAssetId?:string;initialRevisionId?:string;initialView?:string}) {
  const [selection,setSelection]=useState<Selection>({projectId:initialProjectId,assetId:initialAssetId,revisionId:initialRevisionId});
  const [view,setView]=useState<View>(()=>selectedView(initialView));
  const [project,setProject]=useState<ProjectSummary|null>(null);
  const projects=usePagedStudioList<ProjectSummary>("/api/studio/projects","projects");
  useEffect(()=>{setSelection({projectId:initialProjectId,assetId:initialAssetId,revisionId:initialRevisionId});setView(selectedView(initialView));},[initialProjectId,initialAssetId,initialRevisionId,initialView]);
  const currentProject=project?.id===selection.projectId?project:projects.rows.find(row=>row.id===selection.projectId);

  function navigate(next:Selection,nextView=view) {
    setSelection(next);setView(nextView);
    const params=new URLSearchParams();
    if(next.projectId)params.set("projectId",next.projectId);
    if(next.assetId)params.set("asset",next.assetId);
    if(next.revisionId)params.set("revision",next.revisionId);
    if(nextView!=="Conversation")params.set("view",nextView.toLowerCase());
    window.history.replaceState(null,"",`/dashboard/employees${params.size?`?${params}`:""}`);
  }

  return <div className="studio-page employees-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR CREATIVE COMPANY</span><h1>AI Employees.</h1><p>Brief your team. Follow the work. Review every saved revision.</p></div><div className="studio-action-row">
      <Link href="/dashboard/settings#studio-budget" className="studio-button">Manage AI budget <ArrowUpRight size={15}/></Link>
      {currentProject&&<Link href={`/dashboard/projects/${currentProject.id}`} target="_blank" rel="noopener" className="studio-button">Open project <ArrowUpRight size={15}/></Link>}
    </div></header>
    <div className="employees-toolbar">
      <label>Project<select aria-label="Employee project" value={selection.projectId} onChange={event=>navigate({projectId:event.target.value,assetId:"",revisionId:""})}>
        <option value="">Choose a project</option>
        {selection.projectId&&!projects.rows.some(row=>row.id===selection.projectId)&&<option value={selection.projectId}>{currentProject?.name??"Selected project"}</option>}
        {projects.rows.map(row=><option key={row.id} value={row.id}>{row.name}{row.status==="archived"?" (archived)":""}</option>)}
      </select></label>
      <nav className="employees-views" aria-label="Employee workspace">{views.map(name=><button key={name} aria-pressed={view===name} onClick={()=>navigate(selection,name)}>{name}</button>)}</nav>
    </div>
    {projects.nextCursor&&<button className="studio-button" disabled={projects.loading} onClick={()=>void projects.loadMore()}>Load more projects</button>}
    {projects.error&&<p role="alert" className="studio-error">{projects.error}</p>}
    {view==="Team"?<EmployeeDirectory/>:selection.projectId?<EmployeeProject key={`${selection.projectId}:${selection.assetId}:${selection.revisionId}`} selection={selection} view={view} onProject={setProject} clearInput={()=>navigate({...selection,assetId:"",revisionId:""})}/>:<div className="employees-empty"><Users size={32}/><h2>A shared place for your next idea.</h2><p>Choose a project to talk with your Director, assign a specialist or review delivered work.</p><p>Your drafts and assignments stay with their project.</p><Link className="studio-button" href="/dashboard">Browse projects <ArrowUpRight size={15}/></Link></div>}
  </div>;
}

function EmployeeProject({selection,view,onProject,clearInput}:{selection:Selection;view:Exclude<View,"Team">;onProject:(project:ProjectSummary)=>void;clearInput:()=>void}) {
  const {projectId,assetId,revisionId}=selection;
  const [context,setContext]=useState<{project:ProjectSummary;asset?:AssetSummary;ref?:AssetRef}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      requireUuid(projectId,"project ID");
      const {project}=await apiFetch<{project:ProjectSummary}>(`/api/studio/projects/${projectId}`,{signal:controller.signal});
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
      if(!controller.signal.aborted){setContext({project,asset,ref});onProject(project);}
    }
    void load().catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[projectId,assetId,revisionId,onProject]);

  if(error)return <div className="employees-workspace"><p role="alert" className="studio-error">{error}</p>{(assetId||revisionId)&&<button className="studio-button" onClick={clearInput}>Continue without the included file</button>}</div>;
  if(!context)return <p role="status" className="studio-muted">Opening your project team…</p>;
  const openRevision=(ref:AssetRef)=>window.open(`/dashboard/projects/${projectId}?${new URLSearchParams({asset:ref.assetId,revision:ref.revisionId})}`,"_blank","noopener");
  return <section className="employees-workspace" aria-label={`${context.project.name} employees`}>
    {context.ref&&context.asset&&<div className="employees-input"><FileText size={18}/><div><strong>{context.asset.name}</strong><p>This exact saved revision is available to include in your brief. Save any newer editor changes before sharing them.</p></div><button className="studio-button" onClick={()=>openRevision(context.ref!)}>Open saved revision <ArrowUpRight size={14}/></button><button className="studio-button" onClick={clearInput}>Remove file</button></div>}
    {context.project.status==="archived"&&<p className="studio-note">This project is archived. Reactivate it in Project details before sending a brief.</p>}
    <AssignmentPanel projectId={projectId} mode={view==="Conversation"?"director":view==="Assignments"?"assignments":"review"} canvas={view==="Conversation"} preferredAppId={context.asset?.app_id??undefined} selectedRef={context.ref} canAssign={context.project.status==="active"} onOpen={openRevision}/>
  </section>;
}

function EmployeeDirectory() {
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
      return <article key={employee.id} className="studio-app-card"><StudioStudy kind={director?"director":app?.artwork} index={director?0:app?.order}/><div className="studio-craft-caption">{director?<span>{creativeDirector.monogram}</span>:<AppIcon app={app}/>}<small>{director?"DIRECTION":app?.category}</small></div><h2>{employee.role}</h2><h3>{director?"Creative direction & coordination":app?.name}</h3><p>{director?"Turns your brief into a creative direction, brings the specialists together, and returns final work for your review.":app?.tagline}</p><span className="studio-status">{employee.provision_state==="ready"?"Workstation connected":employee.provision_state==="provisioning"?"Preparing workstation":employee.provision_state==="failed"?"Setup needs attention":(director||(app&&isEmployeeReady(app)))?"Ready for your first brief":"Creative tools being connected"}</span>{app?.id==="research"&&<ResearchBrowserButton/>}</article>;
    })}</div>}
  </section>;
}
