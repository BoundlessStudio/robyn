"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { applicationLaunchUrl } from "@/studio/application-launch";
import type { ProjectSummary } from "@/studio/assets";
import type { StudioAppManifest } from "@/studio/manifest";
import { StudioDialog } from "./StudioDialog";
import { usePagedStudioList } from "./usePagedStudioList";

export function OpenApplicationProjectDialog({ app, close }: { app: StudioAppManifest; close: () => void }) {
  const [search, setSearch] = useState("");
  const { rows, loading, error, nextCursor, loadMore } = usePagedStudioList<ProjectSummary>(`/api/studio/projects?status=active&q=${encodeURIComponent(search)}`, "projects");
  const identities = useRef(new Map<string, string>());
  function href(projectId: string) {
    if (!identities.current.has(projectId)) identities.current.set(projectId, crypto.randomUUID());
    return applicationLaunchUrl(projectId, app.id, identities.current.get(projectId)!);
  }
  return <StudioDialog title={`Open ${app.name}.`} eyebrow="CHOOSE A PROJECT" close={close}>
    <p className="studio-muted">A new blank file will be saved in the project you choose.</p>
    <label className="studio-search application-project-search"><Search size={16}/><input aria-label="Find a project" placeholder="Find a project" value={search} onChange={event => setSearch(event.target.value)}/></label>
    {error && <p role="alert" className="studio-error">{error}</p>}
    <nav className="application-project-list" aria-label="Choose a project for application">
      {rows.map(project => <Link key={project.id} href={href(project.id)}><span>{project.name}</span><ArrowUpRight size={16}/></Link>)}
    </nav>
    {loading ? <p role="status" className="studio-muted">Loading projects…</p> : !rows.length && <p className="studio-muted">{search ? "No projects match your search." : "Create your first project to start working."}</p>}
    {nextCursor && <button className="studio-button" disabled={loading} onClick={() => void loadMore()}>Load more projects</button>}
    <Link href={href("new")} className="studio-button primary"><Plus size={16}/>New project with {app.name}</Link>
  </StudioDialog>;
}
