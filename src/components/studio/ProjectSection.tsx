"use client";

import {useEffect,useState,type ReactNode} from "react";
import {apiFetch} from "@/lib/api";
import {requireUuid,type ProjectSummary} from "@/studio/assets";
import {ProjectHeader} from "./ProjectHeader";

export function ProjectSection({projectId,children}:{projectId:string;children:(project:ProjectSummary)=>ReactNode}) {
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
  return <div className="project-section">
    <ProjectHeader projectId={projectId} project={project}/>
    <div className="project-section-content">
      {error?<p className="studio-error studio-page" role="alert">{error}</p>:project?.id===projectId?<div key={project.id}>{children(project)}</div>:<p className="studio-page studio-muted" role="status">Opening project…</p>}
    </div>
  </div>;
}
