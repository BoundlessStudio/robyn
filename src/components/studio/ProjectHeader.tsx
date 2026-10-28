"use client";

import type {ReactNode} from "react";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import type {AssetRef,ProjectSummary} from "@/studio/assets";
import {ProjectNavigationLinks,StudioNavigationMenu} from "./StudioNavigationMenu";

export function ProjectHeader({projectId,project,title,savedRevision,onDashboard}:{projectId:string;project:ProjectSummary|null;title?:ReactNode;savedRevision?:AssetRef;onDashboard?:()=>void}) {
  return <header className="project-header">
    <StudioNavigationMenu projectId={projectId} savedRevision={savedRevision} onDashboard={onDashboard}/>
    <Link className="project-back" href="/dashboard" aria-label="Back to projects" title="Back to projects"><ArrowLeft size={15}/></Link>
    <div className="project-header-name">{title??<Link className="project-section-name" href={`/dashboard/projects/${projectId}`} title="Open project dashboard">{project?.name??"Project"}</Link>}</div>
    {project?.status==="archived"&&<span className="project-archive-label">Archived</span>}
    <ProjectNavigationLinks projectId={projectId} savedRevision={savedRevision} onDashboard={onDashboard}/>
  </header>;
}
