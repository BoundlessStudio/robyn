"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import {StudioBudget} from "./StudioBudget";
import Link from "next/link";
import {ProjectSection,type ProjectSectionDetails} from "./ProjectSection";
import {ProjectDetailsSettings} from "./ProjectDetailsSettings";
import type {ProjectSummary} from "@/studio/assets";

export function StudioSettings({projectId}:{projectId:string}) {
  return <ProjectSection projectId={projectId}>{(project,details)=><ProjectSettings project={project} details={details}/>}</ProjectSection>;
}

function ProjectSettings({project,details}:{project:ProjectSummary;details:ProjectSectionDetails}) {
  useEffect(()=>{const id=window.location.hash.slice(1);if(id==="studio-budget"||id==="project-details")document.getElementById(id)?.scrollIntoView();},[]);
  const {current,userEmail,refresh}=useWorkspace();const [name,setName]=useState(current?.name??"");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [saved,setSaved]=useState(false);
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setSaved(false);setError("");try{await apiFetch("/api/studio/settings",{method:"PATCH",body:JSON.stringify({name})});await refresh();setSaved(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function signOut(){setBusy(true);const{error}=await createClient().auth.signOut();if(error){setError(error.message);setBusy(false);}else window.location.assign("/login");}
  return <div className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">MAKE YOURSELF AT HOME</span><h1>Settings.</h1><p>Manage this project here. Studio details, AI allowances and account settings apply across your projects.</p></div></header><ProjectDetailsSettings project={project} {...details}/><section className="studio-setting-section"><h2>Studio details</h2><form className="studio-form" onSubmit={save}><label>Studio name<input required maxLength={120} value={name} onChange={e=>{setName(e.target.value);setSaved(false);}}/></label><div><button className="studio-button primary" disabled={busy}>{busy?"Saving…":"Save changes"}</button></div>{error&&<p role="alert" className="studio-error">{error}</p>}{saved&&<p role="status" className="studio-success">Studio name saved.</p>}</form></section><StudioBudget/><section className="studio-setting-section"><h2>Work and support</h2><p><Link href="/dashboard/health">Studio health and recovery</Link> · <Link href="/support">Contact support</Link> · <Link href="/privacy">Privacy and data handling</Link></p></section><section className="studio-setting-section"><h2>Private by design</h2><p>This pilot gives each invited creator a private studio. Files, project conversations, and employee workstations belong to that studio.</p><p>Saved revisions keep each creative direction recoverable. You and your team can continue from any saved revision.</p></section><section className="studio-setting-section"><h2>Your account</h2><p>{userEmail}</p><button className="studio-button" onClick={signOut} disabled={busy}>Sign out</button></section></div>;
}
