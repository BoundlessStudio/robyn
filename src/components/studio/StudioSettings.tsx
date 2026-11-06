"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import {StudioBudget} from "./StudioBudget";
import Link from "next/link";
import {ProjectSection} from "./ProjectSection";
import {ProjectDetailsSettings} from "./ProjectDetailsSettings";
import {StudioMcpSettings} from "./StudioMcpSettings";

export function StudioSettings({ projectId, mcpEndpoint }: { projectId?: string; mcpEndpoint?: string }) {
  if (!projectId) return <SettingsContent mcpEndpoint={mcpEndpoint} />;
  return <ProjectSection projectId={projectId}>
    {(project, { onProjectChange }) => <SettingsContent
      mcpEndpoint={mcpEndpoint}
      projectDetails={<ProjectDetailsSettings project={project} onProjectChange={onProjectChange} />}
    />}
  </ProjectSection>;
}

function SettingsContent({ projectDetails, mcpEndpoint }: { projectDetails?: ReactNode; mcpEndpoint?: string }) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (["studio-budget", "project-details", "external-mcp"].includes(id)) document.getElementById(id)?.scrollIntoView();
  }, []);
  const {current,userEmail,refresh}=useWorkspace();const [name,setName]=useState(current?.name??"");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [saved,setSaved]=useState(false);
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setSaved(false);setError("");try{await apiFetch("/api/studio/settings",{method:"PATCH",body:JSON.stringify({name})});await refresh();setSaved(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function signOut(){setBusy(true);const{error}=await createClient().auth.signOut();if(error){setError(error.message);setBusy(false);}else window.location.assign("/login");}
  return <div className="studio-page studio-settings">
    <header className="studio-page-heading"><div><span className="studio-eyebrow">MAKE YOURSELF AT HOME</span><h1>Settings.</h1><p>{projectDetails
      ? "Manage this project here. Studio details, AI allowance and account settings apply across your projects."
      : "Manage your Studio details, connections, AI allowance and account."}</p></div></header>
    <div className="studio-settings-layout">
      <div className="studio-settings-main">
        {projectDetails}
        <section className="studio-setting-section"><h2>Studio details</h2><form className="studio-form" onSubmit={save}><label>Studio name<input required maxLength={120} value={name} onChange={e=>{setName(e.target.value);setSaved(false);}}/></label><div><button className="studio-button primary" disabled={busy}>{busy?"Saving…":"Save changes"}</button></div>{error&&<p role="alert" className="studio-error">{error}</p>}{saved&&<p role="status" className="studio-success">Studio name saved.</p>}</form></section>
        <StudioMcpSettings endpoint={mcpEndpoint} />
        <StudioBudget/>
        <section className="studio-setting-section"><h2>Work and support</h2><p><Link href="/dashboard/health">Studio health and recovery</Link> · <Link href="/support">Contact support</Link> · <Link href="/privacy">Privacy and data handling</Link></p></section>
        <section className="studio-setting-section"><h2>Private by design</h2><p>This pilot gives each invited creator a private studio. Files, project conversations and Robyn’s workstation belong to that studio.</p><p>Saved revisions keep each creative direction recoverable. You and Robyn can continue from any saved revision.</p></section>
        <section className="studio-setting-section"><h2>Your account</h2><p>{userEmail}</p><button className="studio-button" onClick={signOut} disabled={busy}>Sign out</button></section>
      </div>
    </div>
  </div>;
}
