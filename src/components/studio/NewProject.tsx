"use client";

import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {apiFetch} from "@/lib/api";

/** The address retains creation intent across reloads and lost replies. */
export function NewProject() {
  const router=useRouter(),running=useRef(false);
  const [error,setError]=useState("");
  async function open(){
    if(running.current)return;running.current=true;setError("");
    try{
      const url=new URL(window.location.href);
      let creationId=url.searchParams.get("request");
      if(!creationId){creationId=crypto.randomUUID();url.searchParams.set("request",creationId);window.history.replaceState(null,"",url.pathname+url.search);}
      const {project}=await apiFetch<{project:{id:string}}>("/api/studio/projects",{method:"POST",body:JSON.stringify({creationId,name:"Untitled project",brief:""})});
      if(project.id!==creationId)throw Error("The project could not be confirmed. Try opening it again.");
      router.replace(`/dashboard/projects/${project.id}`);
    }catch(reason){setError(reason instanceof Error?reason.message:"Your project could not be opened.");running.current=false;}
  }
  useEffect(()=>{void open();},[]);
  return <section className="studio-page new-project-opening" aria-label="Open a new project"><span className="studio-eyebrow">A PLACE TO BEGIN</span><h1>A little space<br/>for <em>possibility.</em></h1>{error?<><p role="alert" className="studio-error">{error}</p><button className="studio-button primary" onClick={()=>void open()}>Try opening again</button></>:<p role="status">Opening your canvas…</p>}</section>;
}
