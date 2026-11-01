"use client";

import {useEffect,useRef,useState} from "react";
import {File,Upload} from "lucide-react";
import {apiFetch} from "@/lib/api";
import type {AssetSummary} from "@/studio/assets";
import type {StudioAppManifest} from "@/studio/manifest";
import {StudioDialog} from "./StudioDialog";

export function ReadOnlyApplicationDialog({projectId,app,close,onOpen,onFiles,onFolder,returnFocusRef}:{
  projectId:string;app:StudioAppManifest;close:()=>void;onOpen:(asset:AssetSummary)=>void;onFiles:()=>void;onFolder:()=>void;returnFocusRef?:React.RefObject<HTMLElement|null>;
}){
  const [assets,setAssets]=useState<AssetSummary[]>([]),[search,setSearch]=useState("");
  const [cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const sequence=useRef(0),pageRequest=useRef<AbortController|null>(null);
  const endpoint=`/api/studio/assets?projectId=${encodeURIComponent(projectId)}&appId=${encodeURIComponent(app.id)}&q=${encodeURIComponent(search)}`;
  function checked(rows:AssetSummary[]){
    if(!Array.isArray(rows)||rows.some(row=>row.project_id!==projectId||row.app_id!==app.id))throw Error("The report list did not match this project.");
    return rows.filter(row=>row.current_revision_id);
  }
  useEffect(()=>{
    const controller=new AbortController(),current=++sequence.current;
    pageRequest.current?.abort();setAssets([]);setCursor(null);setLoading(true);setError("");
    const timer=window.setTimeout(()=>{
      void apiFetch<{assets:AssetSummary[];nextCursor:string|null}>(endpoint,{signal:controller.signal}).then(data=>{
        if(sequence.current===current){setAssets(checked(data.assets));setCursor(data.nextCursor);}
      }).catch(error=>{if(!controller.signal.aborted&&sequence.current===current)setError(error.message);}).finally(()=>{if(!controller.signal.aborted&&sequence.current===current)setLoading(false);});
    },180);
    return()=>{controller.abort();pageRequest.current?.abort();window.clearTimeout(timer);};
  },[endpoint,projectId,app.id]);
  async function loadMore(){
    if(!cursor||loading)return;
    const current=sequence.current,controller=new AbortController();pageRequest.current=controller;setLoading(true);setError("");
    try{
      const data=await apiFetch<{assets:AssetSummary[];nextCursor:string|null}>(`${endpoint}&cursor=${encodeURIComponent(cursor)}`,{signal:controller.signal});
      if(sequence.current===current){const rows=checked(data.assets);setAssets(previous=>[...new Map([...previous,...rows].map(row=>[row.id,row])).values()]);setCursor(data.nextCursor);}
    }catch(error){if(!controller.signal.aborted&&sequence.current===current)setError((error as Error).message);}
    finally{if(!controller.signal.aborted&&sequence.current===current)setLoading(false);}
  }
  return <StudioDialog title={`Open ${app.name} report.`} eyebrow="READ ONLY" close={close} returnFocusRef={returnFocusRef}>
    <div className="report-picker">
      <p>Open a saved report or import its native files. Filters and queries stay in this viewing session.</p>
      <label>Search reports<input value={search} onChange={event=>setSearch(event.target.value)} autoComplete="off"/></label>
      {error&&<p className="studio-error" role="alert">{error}</p>}
      <ul className="report-picker-list">{assets.map(asset=><li key={asset.id}><button className="studio-button" onClick={()=>onOpen(asset)}><File size={15}/><span>{asset.name}</span></button></li>)}</ul>
      {loading?<p role="status">Loading reports…</p>:!assets.length&&<p className="studio-muted">{search?"No matching reports.":"This project has no saved reports for this application yet."}</p>}
      {cursor&&<button className="studio-button" disabled={loading} onClick={()=>void loadMore()}>Load more reports</button>}
      <div className="studio-action-row"><button className="studio-button primary" onClick={onFiles}><Upload size={14}/>Import report</button><button className="studio-button" onClick={onFolder}>Import folder or linked files</button></div>
    </div>
  </StudioDialog>;
}
