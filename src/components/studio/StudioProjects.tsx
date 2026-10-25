"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowUpRight, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ProjectSummary } from "@/studio/assets";
import { usePagedStudioList } from "./usePagedStudioList";
import { StudioDialog } from "./StudioDialog";
import { BloomImage, OrbitMark, Waveform } from "@/components/home/Artwork";

export function StudioProjects() {
  const router = useRouter();
  const [error,setError] = useState("");
  const [search,setSearch] = useState("");
  const [showNew,setShowNew] = useState(false);
  const [saving,setSaving] = useState(false);
  const [archived,setArchived] = useState(false);
  const {rows:projects,loading,error:pageError,nextCursor,loadMore}=usePagedStudioList<ProjectSummary>(`/api/studio/projects?q=${encodeURIComponent(search)}&status=${archived?"archived":"active"}`,"projects");
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);setSaving(true);setError("");
    try { const {project} = await apiFetch<{project:ProjectSummary}>("/api/studio/projects",{method:"POST",body:JSON.stringify({name:fields.get("name"),brief:fields.get("brief")})});router.push(`/dashboard/projects/${project.id}`); }
    catch(error){setError((error as Error).message);setSaving(false);}
  }
  const visible = projects;
  return <div className="studio-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">THE WORKING COLLECTION</span><h1>A place for<br/><em>the unfinished.</em></h1><p>Experiments, obsessions, and the work in between.</p></div><div className="studio-create-aside"><span aria-hidden="true">↗</span><button className="studio-button primary" onClick={()=>setShowNew(true)}><Plus size={17}/> New project</button></div></header>
    <div className="studio-toolbar"><div className="studio-view-switch" aria-label="Project view"><button aria-pressed={!archived} onClick={()=>setArchived(false)}>Active projects <span>{projects.filter(p=>p.status === "active").length}</span></button><button aria-pressed={archived} onClick={()=>setArchived(true)}>Archived</button></div><label className="studio-search"><Search size={16}/><input aria-label="Search projects" placeholder="Find a project" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
    {(error||pageError) && <p className="studio-error" role="alert">{error||pageError}</p>}
    {!loading&&projects.length===0&&!search&&!archived&&<section className="studio-inspiration" aria-label="Original Robyn studio artwork"><div className="inspiration-note"><span>YOUR STUDIO IS OPEN.</span><p>Leave a little room<br/>for <em>the unexpected.</em></p><b>↓ A new idea goes here</b></div><div className="inspiration-art"><div className="inspiration-print"><BloomImage priority/><span>OFFSCRIPT / IMAGE STUDY 001</span></div><div className="inspiration-poster"><span>AN EXERCISE IN POSSIBILITY</span><OrbitMark/><strong>off<br/><em>script.</em></strong></div><div className="inspiration-sound"><Waveform/><span>FOLLOW THE FEELING. ↗</span></div></div><span className="inspiration-caption">ORIGINAL STUDIO ARTWORK · YOUR PROJECTS WILL APPEAR BELOW</span></section>}
    {loading ? <p className="studio-muted" role="status">Opening your studio…</p> : <div className="studio-project-grid">{visible.map((project,index)=><Link href={`/dashboard/projects/${project.id}`} className="studio-project-card" key={project.id}><div className={`studio-project-art art-${index%4}`} aria-hidden="true">{project.preview_url?<img src={project.preview_url} alt="" loading="lazy"/>:<><span>{String(index+1).padStart(2,"0")}</span><i/><b>WORK IN<br/>PROGRESS</b></>}</div><div className="studio-project-info"><div><h2>{project.name}</h2><p>{project.brief || "An idea waiting to take shape."}</p><small>Updated {new Date(project.updated_at).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</small></div><ArrowUpRight size={20}/></div></Link>)}{!archived && !search && <button className="studio-new-project" onClick={()=>setShowNew(true)}><span className="studio-outline-orbit" aria-hidden="true"><Plus size={32}/></span><strong>{projects.length ? "Something else in mind?" : "This is where it starts."}</strong><p>A campaign, a film, an idea<br/>you can’t stop thinking about.</p><span>Start a project <ArrowUpRight size={16}/></span></button>}{visible.length===0 && (archived || search) && <p className="studio-empty">{search ? "No projects match your search." : "Your archived projects will appear here."}</p>}</div>}
    {nextCursor&&<button className="studio-button" disabled={loading} onClick={()=>void loadMore()}>Load more projects</button>}
    <div className="studio-footnote"><span>01 / PROJECTS</span><span>Native files. Saved revisions. Possibilities.</span></div>
    {showNew && <StudioDialog title="What are we making?" eyebrow="A PLACE TO BEGIN" close={()=>!saving&&setShowNew(false)} busy={saving}><form onSubmit={create}><label>Project name<input name="name" maxLength={120} placeholder="The next great thing" required autoFocus/></label><label>The brief<textarea name="brief" maxLength={20000} placeholder="The idea, the audience, the feeling. Bring whatever you have." rows={5}/></label>{error&&<p className="studio-error" role="alert">{error}</p>}<button className="studio-button primary" disabled={saving}>{saving?"Creating project…":"Create project"}<ArrowUpRight size={17}/></button></form></StudioDialog>}
  </div>;
}
