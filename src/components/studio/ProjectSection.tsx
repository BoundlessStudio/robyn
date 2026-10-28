"use client";

import {useEffect,useState,type ReactNode} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {requireUuid,type ProjectSummary} from "@/studio/assets";
import {StudioNavigationMenu,projectNavigation} from "./StudioNavigationMenu";

export function ProjectSection({projectId,children}:{projectId:string;children:(project:ProjectSummary)=>ReactNode}) {
  const path=usePathname();
  const [project,setProject]=useState<ProjectSummary|null>(null),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();setProject(null);setError("");
    void (async()=>{
      requireUuid(projectId,"project ID");
      const result=await apiFetch<{project:ProjectSummary}>(`/api/studio/projects/${projectId}`,{signal:controller.signal});
      if(result.project.id!==projectId)throw Error("The selected project could not be opened.");
      if(!controller.signal.aborted)setProject(result.project);
    })().catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[projectId]);
  const home=`/dashboard/projects/${projectId}`;
  return <div className="project-section">
    <header className="project-header">
      <StudioNavigationMenu projectId={projectId}/>
      <Link className="project-back" href="/dashboard" aria-label="Back to projects" title="Back to projects"><ArrowLeft size={15}/></Link>
      <Link className="project-section-name" href={home} title="Open project home">{project?.name??"Project"}</Link>
      {project?.status==="archived"&&<span className="project-archive-label">Archived</span>}
      <nav className="project-header-actions" aria-label="Project navigation">
        {projectNavigation(projectId).map(({href,label,icon:Icon})=><Link key={href} className="studio-tool-button" href={href} aria-current={path.startsWith(href)?"page":undefined}><Icon size={16}/><span>{label}</span></Link>)}
      </nav>
    </header>
    <div className="project-section-content">
      {error?<p className="studio-error studio-page" role="alert">{error}</p>:project?.id===projectId?<div key={project.id}>{children(project)}</div>:<p className="studio-page studio-muted" role="status">Opening project…</p>}
    </div>
  </div>;
}
