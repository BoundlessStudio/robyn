"use client";
import { useState } from "react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

export function StudioSettings() {
  const {current,userEmail,refresh}=useWorkspace();const [name,setName]=useState(current?.name??"");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [saved,setSaved]=useState(false);
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setSaved(false);setError("");try{await apiFetch("/api/studio/settings",{method:"PATCH",body:JSON.stringify({name})});await refresh();setSaved(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function signOut(){setBusy(true);const{error}=await createClient().auth.signOut();if(error){setError(error.message);setBusy(false);}else window.location.assign("/login");}
  return <div className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">MAKE YOURSELF AT HOME</span><h1>Your studio.<br/><em>Your space.</em></h1></div></header><section className="studio-setting-section"><h2>Studio details</h2><form className="studio-form" onSubmit={save}><label>Studio name<input required maxLength={120} value={name} onChange={e=>{setName(e.target.value);setSaved(false);}}/></label><div><button className="studio-button primary" disabled={busy}>{busy?"Saving…":"Save changes"}</button></div>{error&&<p role="alert" className="studio-error">{error}</p>}{saved&&<p role="status" className="studio-success">Studio name saved.</p>}</form></section><section className="studio-setting-section"><h2>Private by design</h2><p>This pilot gives each invited creator a private studio. Files, project conversations, and employee workstations belong to that studio.</p><p>Saved revisions keep each creative direction recoverable. You and your team can continue from any saved revision.</p></section><section className="studio-setting-section"><h2>Your account</h2><p>{userEmail}</p><button className="studio-button" onClick={signOut} disabled={busy}>Sign out</button></section></div>;
}
