"use client";

import {useEffect,useState,type ReactNode} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ArrowLeft,Globe,Images,Users} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {requireUuid,type ProjectSummary} from "@/studio/assets";
import {StudioNavigationMenu} from "./StudioNavigationMenu";

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
  const links=[{section:"library",label:"Assets",icon:Images},{section:"employees",label:"AI Employees",icon:Users},{section:"research",label:"Research",icon:Globe}];
  return <div className="project-section">
    <header className="project-header">
      <StudioNavigationMenu/>
      <Link className="project-back" href="/dashboard" aria-label="Back to projects" title="Back to projects"><ArrowLeft size={15}/></Link>
      <Link className="project-section-name" href={home} title="Open project home">{project?.name??"Project"}</Link>
      {project?.status==="archived"&&<span className="project-archive-label">Archived</span>}
      <nav className="project-header-actions" aria-label="Project navigation">
        <Link className="studio-tool-button" href={home}><span>Project home</span></Link>
        {links.map(({section,label,icon:Icon})=><Link key={section} className="studio-tool-button" href={`${home}/${section}`} aria-current={path.startsWith(`${home}/${section}`)?"page":undefined}><Icon size={16}/><span>{label}</span></Link>)}
      </nav>
    </header>
    <div className="project-section-content">
      {error?<p className="studio-error studio-page" role="alert">{error}</p>:project?.id===projectId?<div key={project.id}>{children(project)}</div>:<p className="studio-page studio-muted" role="status">Opening project…</p>}
    </div>
  </div>;
}
