"use client";
import { AppIcon } from "./AppIcon";
import { useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { studioTools as studioApps } from "@/studio/tools";
import type { AssetSummary } from "@/studio/assets";
import { usePagedStudioList } from "./usePagedStudioList";
import { StudioStudy } from "./StudioStudy";

export function StudioLibrary() {
  const [search,setSearch]=useState("");
  const {rows:assets,loading,error,nextCursor,loadMore}=usePagedStudioList<AssetSummary>(`/api/studio/assets?q=${encodeURIComponent(search)}`,"assets");

  const visible=assets;
  return <div className="studio-page">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">THE WORK, ALL TOGETHER</span><h1>Your growing<br/><em>body of work.</em></h1><p>Native projects, acquired media, and their exact saved revisions.</p></div><Link href="/dashboard" className="studio-button">Open a project <ArrowUpRight size={16}/></Link></header>
    <div className="studio-toolbar"><span className="studio-muted">{assets.length} {assets.length===1?"asset":"assets"} across your studio</span><label className="studio-search"><Search size={16}/><input aria-label="Search assets" placeholder="Find an asset" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    {error&&<p role="alert" className="studio-error">{error}</p>}
    {loading?<p role="status" className="studio-muted">Loading your library…</p>:visible.length?<div className="studio-library-grid">{visible.map(asset=>{const app=studioApps.find(app=>app.id===asset.app_id);return <Link className="studio-library-piece" href={`/dashboard/projects/${asset.project_id}?asset=${asset.id}`} key={asset.id}>
      <div className="library-art">{asset.preview_url?<img src={asset.preview_url} alt={`Preview of ${asset.name}`} loading="lazy"/>:<>{app?<AppIcon app={app} className="library-app-icon"/>:<span className="library-file-mark">{asset.asset_kind?.slice(0,2).toUpperCase()}</span>}<span className="library-file-label">{app?.name??asset.asset_kind} / {asset.asset_kind&&asset.asset_kind!=="native"?"SOURCE MEDIA":"NATIVE DOCUMENT"}</span></>}</div>
      <div className="library-piece-heading"><h2>{asset.name}</h2><ArrowUpRight size={19}/></div><p>{asset.project?.name??"Project"}</p><small>{app?.name??`${asset.asset_kind} source`} · {asset.current_revision_id?"Saved revision":"Awaiting first save"}</small>
    </Link>;})}</div>:search?<p className="studio-empty">No assets match your search.</p>:<section className="library-empty"><StudioStudy kind="vector"/><div><span className="studio-eyebrow">COLLECT WHAT MOVES YOU</span><h2>Your first piece<br/><em>belongs here.</em></h2><p>Bring a native file into a project. Every saved revision becomes part of your growing collection.</p><Link href="/dashboard" className="studio-button primary">Find its home <ArrowUpRight size={16}/></Link><small>Original studio artwork · your assets will appear here</small></div></section>}
    {nextCursor&&<button className="studio-button" disabled={loading} onClick={()=>void loadMore()}>Load more assets</button>}
  </div>;
}
