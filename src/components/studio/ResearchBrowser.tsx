"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {apiFetch} from "@/lib/api";
import type RFB from "@novnc/novnc";
import {ProjectSection} from "./ProjectSection";

type Control={control:"agent"|"requesting"|"human";controlId:string|null};
export function ResearchBrowser({projectId}:{projectId:string}){
  return <ProjectSection projectId={projectId}>{()=> <ResearchSession projectId={projectId}/>}</ProjectSection>;
}
function ResearchSession({projectId}:{projectId:string}){
  const endpoint=`/api/studio/research/browser?${new URLSearchParams({projectId})}`;
  const target=useRef<HTMLDivElement>(null),rfb=useRef<RFB|null>(null),generation=useRef(0),taking=useRef(false),live=useRef(true);
  const [connection,setConnection]=useState("Connecting…"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[control,setControl]=useState<Control>({control:"agent",controlId:null}),[interactive,setInteractive]=useState(false);
  const [retry,setRetry]=useState(0);
  const api=(body:unknown)=>apiFetch<Control>(endpoint,{method:"POST",body:JSON.stringify(body)});
  function viewOnly(){taking.current=false;if(rfb.current)rfb.current.viewOnly=true;setInteractive(false);}
  useEffect(()=>{
    live.current=true;const epoch=++generation.current;let active=true,connection:RFB|null=null;
    async function connect(){
      setConnection("Connecting…");setError("");
      const [{default:Browser},data]=await Promise.all([import("@novnc/novnc"),apiFetch<Control&{ws:string}>(endpoint,{method:"POST",body:JSON.stringify({action:"connect"})})]);
      if(!active||epoch!==generation.current||!target.current)return;
      setControl(data);connection=new Browser(target.current,data.ws);rfb.current=connection;connection.viewOnly=true;connection.scaleViewport=true;connection.resizeSession=false;
      connection.addEventListener("connect",()=>{if(active)setConnection("Connected");});
      connection.addEventListener("disconnect",()=>{if(rfb.current===connection)rfb.current=null;if(active){viewOnly();setConnection("Disconnected");}});
      connection.addEventListener("securityfailure",()=>{if(active){viewOnly();setError("The browser connection was refused. Reconnect for a fresh private connection.");}});
    }
    void connect().catch(error=>{if(active){setError(error.message);setConnection("Disconnected");}});
    const timer=window.setInterval(()=>{void apiFetch<Control>(endpoint).then(data=>{if(active){setControl(data);if(data.control!=="human"&&rfb.current&&!rfb.current.viewOnly)viewOnly();}}).catch(()=>{});},4000);
    const hidden=()=>{if(document.hidden)viewOnly();};document.addEventListener("visibilitychange",hidden);
    return()=>{live.current=false;active=false;++generation.current;taking.current=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",hidden);if(rfb.current===connection){rfb.current=null;connection?.disconnect();}};
  },[retry,endpoint]);
  async function take(){
    if(busy||connection!=="Connected"||!rfb.current)return;
    const current=rfb.current,epoch=generation.current;const controlId=control.control!=="agent"&&control.controlId?control.controlId:crypto.randomUUID();
    setBusy(true);setError("");taking.current=true;
    try{
      for(let attempt=0;attempt<90;attempt++){
        const result=await api({action:"take",controlId});if(!live.current)return;setControl(result);
        if(result.control==="human"){
          if(taking.current&&generation.current===epoch&&rfb.current===current&&!document.hidden){current.viewOnly=false;current.focus();setInteractive(true);}return;
        }
        if(!taking.current||generation.current!==epoch)return;
        await new Promise(resolve=>window.setTimeout(resolve,2000));
      }
      throw Error("Robyn is still stopping the current browser action. Keep watching, then retry Take over.");
    }catch(error){if(live.current)setError((error as Error).message);}finally{if(live.current)setBusy(false);}
  }
  async function giveBack(){
    if(!control.controlId||busy)return;
    viewOnly();const previous=rfb.current;rfb.current=null;previous?.disconnect();setBusy(true);setError("");
    try{const result=await api({action:"return",controlId:control.controlId});if(live.current){setControl(result);setRetry(value=>value+1);}}
    catch(error){if(live.current)setError((error as Error).message);}finally{if(live.current)setBusy(false);}
  }
  return <div className="studio-page research-browser-page"><header className="research-browser-heading"><div><span className="studio-eyebrow">ROBYN / CHROME & BRAVE SEARCH</span><h1>A window into<br/><em>what’s possible.</em></h1></div><Link className="studio-button" href={`/dashboard/projects/${projectId}/employees?view=jobs`}>Robyn’s jobs ↗</Link></header><section className="research-browser-frame" aria-label="Robyn’s live browser"><div className="research-browser-controls"><span role="status">{interactive?"You have control":control.control==="requesting"?"Waiting for Robyn to stop…":control.control==="human"?"Robyn is paused · browser held for you":connection==="Connected"?"Robyn has control":connection}</span><div><button className="studio-tool-button" onClick={()=>{viewOnly();setRetry(value=>value+1);}} disabled={busy}>Reconnect</button><button className="studio-tool-button" onClick={take} disabled={busy||interactive||connection!=="Connected"}>{busy&&control.control!=="human"?"Waiting…":control.control==="human"?"Resume takeover":"Take over"}</button>{control.control==="human"&&<button className="studio-tool-button" onClick={giveBack} disabled={busy}>Return control</button>}</div></div>{error&&<p className="studio-error" role="alert">{error}</p>}<div className="research-browser-screen" ref={target}/></section><p className="research-browser-note">Robyn uses this browser for research and web tasks. Briefs and saved Notes stay with their project. Watch Robyn work, or take over for a sign-in or a detail only you can handle. Return control to continue the same job. If you leave while in control, Robyn stays paused until you return it.</p></div>;
}
