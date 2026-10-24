"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { studioTools as studioApps } from "@/studio/tools";
import type { AssetSummary, ProjectSummary } from "@/studio/assets";
import { StudioStudy } from "./StudioStudy";

export function StudioLibrary() {
  const [assets,setAssets]=useState<AssetSummary[]>([]);const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [search,setSearch]=useState("");const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;Promise.all([apiFetch<{assets:AssetSummary[]}>("/api/studio/assets"),apiFetch<{projects:ProjectSummary[]}>("/api/studio/projects")]).then(([a,p])=>{if(active){setAssets(a.assets);setProjects(p.projects);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const visible=assets.filter(asset=>asset.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="studio-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">THE WORK, ALL TOGETHER</span><h1>Your growing<br/><em>body of work.</em></h1><p>Every native master, linked file, and saved revision.</p></div><Link href="/dashboard" className="studio-button">Open a project <ArrowUpRight size={16}/></Link></header>
    <div className="studio-toolbar"><span className="studio-muted">{assets.length} {assets.length===1?"asset":"assets"} across your studio</span><label className="studio-search"><Search size={16}/><input aria-label="Search assets" placeholder="Find an asset" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    {error&&<p role="alert" className="studio-error">{error}</p>}
    {loading?<p role="status" className="studio-muted">Loading your library…</p>:visible.length?<div className="studio-library-grid">{visible.map(asset=>{const app=studioApps.find(app=>app.id===asset.app_id);return <Link className="studio-library-piece" href={`/dashboard/projects/${asset.project_id}?asset=${asset.id}`} key={asset.id}>
      <div className="library-art">{asset.preview_url?<img src={asset.preview_url} alt={`Preview of ${asset.name}`} loading="lazy"/>:<><span className="library-file-mark" style={{color:app?.color}}>{app?.monogram}</span><span className="library-file-label">{app?.name} / NATIVE DOCUMENT</span></>}</div>
      <div className="library-piece-heading"><h2>{asset.name}</h2><ArrowUpRight size={19}/></div><p>{projects.find(p=>p.id===asset.project_id)?.name??"Project"}</p><small>{app?.name} · {asset.current_revision_id?"Saved native file":"Awaiting first save"}</small>
    </Link>;})}</div>:search?<p className="studio-empty">No assets match your search.</p>:<section className="library-empty"><StudioStudy kind="vector"/><div><span className="studio-eyebrow">COLLECT WHAT MOVES YOU</span><h2>Your first piece<br/><em>belongs here.</em></h2><p>Bring a native file into a project. Every saved revision becomes part of your growing collection.</p><Link href="/dashboard" className="studio-button primary">Find its home <ArrowUpRight size={16}/></Link><small>Original studio artwork · your assets will appear here</small></div></section>}
  </div>;
}
