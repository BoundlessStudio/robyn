"use client";

import {useState} from "react";
import {apiFetch} from "@/lib/api";
import type {ProjectSummary} from "@/studio/assets";
import type {ProjectSectionDetails} from "./ProjectSection";

export function ProjectDetailsSettings({project,activity,onProjectChange}:{project:ProjectSummary}&ProjectSectionDetails) {
  const [name,setName]=useState(project.name),[brief,setBrief]=useState(project.brief);
  const [busy,setBusy]=useState<"save"|"status"|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");

  async function save(event:React.FormEvent){
    event.preventDefault();if(busy||!name.trim())return;
    setBusy("save");setError("");setNotice("");
    try{
      const result=await apiFetch<{project:ProjectSummary}>(`/api/studio/projects/${project.id}`,{method:"PATCH",body:JSON.stringify({name:name.trim(),brief})});
      onProjectChange(result.project);setName(result.project.name);setBrief(result.project.brief);setNotice("Project details saved.");
    }catch(reason){setError((reason as Error).message);}finally{setBusy(null);}
  }

  async function archive(){
    if(busy)return;
    setBusy("status");setError("");setNotice("");
    try{
      const result=await apiFetch<{project:ProjectSummary}>(`/api/studio/projects/${project.id}`,{method:"PATCH",body:JSON.stringify({status:project.status==="active"?"archived":"active"})});
      onProjectChange(result.project);setNotice(result.project.status==="archived"?"Project archived.":"Project reactivated.");
    }catch(reason){setError((reason as Error).message);}finally{setBusy(null);}
  }

  return <>
    <section id="project-details" className="studio-setting-section">
      <h2>Project details</h2>
      <p>Name your project and keep its creative direction here.</p>
      <form className="studio-form" onSubmit={save}>
        <label>Project name<input required maxLength={120} value={name} disabled={Boolean(busy)} onChange={event=>{setName(event.target.value);setNotice("");}}/></label>
        <label>Project brief<textarea rows={7} maxLength={20000} value={brief} disabled={Boolean(busy)} onChange={event=>{setBrief(event.target.value);setNotice("");}} placeholder="What are we making? Who is it for? What should it feel like?"/></label>
        <div><button className="studio-button primary" disabled={Boolean(busy)||!name.trim()}>{busy==="save"?"Saving…":"Save project details"}</button></div>
      </form>
      <div className="project-archive">
        <p>{project.status==="archived"?"Reactivate this project to create files and send briefs.":"Archive finished work and keep its saved files close."}</p>
        <button className="studio-button" onClick={()=>void archive()} disabled={Boolean(busy)}>{busy==="status"?"Updating…":project.status==="archived"?"Reactivate project":"Archive project"}</button>
      </div>
      {error&&<p role="alert" className="studio-error">{error}</p>}
      {notice&&<p role="status" className="studio-success">{notice}</p>}
    </section>
    <section className="studio-setting-section">
      <h2>Project activity</h2>
      {activity.length?<ol className="project-activity">{activity.map(event=><li key={event.id}>
        <strong>{event.kind==="revision.committed"?"A new revision was saved":event.kind==="revision.conflict"?"A conflicting save was preserved":event.kind==="asset.forked"?"A revision became a new asset":event.kind}</strong>
        <small>{new Date(event.created_at).toLocaleString()}</small>
      </li>)}</ol>:<p className="studio-muted">Saves and creative handoffs will appear here.</p>}
    </section>
  </>;
}
