"use client";
import {useEffect,useState} from "react";
import {apiFetch} from "@/lib/api";

export function ProjectName({id,name,onSaved}:{id:string;name:string;onSaved:()=>Promise<unknown>}){
  const [editing,setEditing]=useState(false),[value,setValue]=useState(name),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>setValue(name),[name]);
  async function save(event:React.FormEvent){
    event.preventDefault();if(busy||!value.trim())return;
    setBusy(true);setError("");
    try{await apiFetch(`/api/studio/projects/${id}`,{method:"PATCH",body:JSON.stringify({name:value.trim()})});await onSaved();setEditing(false);}
    catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }
  return <div className="project-name">{editing?<form onSubmit={save}><input aria-label="Project name" value={value} onChange={event=>setValue(event.target.value)} maxLength={120} autoFocus disabled={busy} onKeyDown={event=>{if(event.key==="Escape"){setEditing(false);setValue(name);setError("");}}}/><button className="studio-tool-button" disabled={busy||!value.trim()}>Save name</button><button type="button" className="studio-tool-button" disabled={busy} onClick={()=>{setEditing(false);setValue(name);setError("");}}>Cancel</button></form>:<h1 aria-label={name}><button title="Rename project" aria-label={`Rename project: ${name}`} onClick={()=>setEditing(true)}>{name}</button></h1>}{error&&<p role="alert" className="studio-error">{error}</p>}</div>;
}
