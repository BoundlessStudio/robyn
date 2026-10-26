"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {apiFetch} from "@/lib/api";
interface HealthJob {kind:string;jobId:string;projectId:string;state:string;lastSuccessAt:string|null;lastProgressAt:string;lastCheckedAt:string;errorCode:string|null;detail:string|null;retryAt:string|null;failures:number;needsAttention:boolean}
const reasons:Record<string,string>={platform_unavailable:"The platform is temporarily unavailable.",resource_missing:"A required resource could not be found.",authorization_changed:"Access changed while work was running.",workflow_step_failed:"This step needs investigation."};
export function StudioHealth(){
  const[jobs,setJobs]=useState<HealthJob[]>([]),[error,setError]=useState(""),[truncated,setTruncated]=useState(false);
  useEffect(()=>{let live=true;const load=()=>apiFetch<{jobs:HealthJob[];truncated:boolean}>("/api/studio/health").then(data=>{if(live){setJobs(data.jobs);setTruncated(data.truncated);setError("");}}).catch(error=>{if(live)setError(error.message);});void load();const timer=setInterval(()=>void load(),30000);return()=>{live=false;clearInterval(timer);};},[]);
  return <div className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">WORK AND RECOVERY</span><h1>Studio <em>health.</em></h1><p>Progress, pauses and work that needs attention. Unknown payments and employee turns keep their existing reservations.</p></div></header>
    {error&&<p role="alert" className="studio-error">{error}</p>}{truncated&&<p>Showing the 200 most recently checked jobs. Open an older project for its full history.</p>}
    <div className="media-jobs">{[...jobs].sort((a,b)=>Number(b.needsAttention)-Number(a.needsAttention)).map(job=><article key={`${job.kind}:${job.jobId}`}><div><strong>{job.needsAttention?"Needs attention":"Tracked"} · {job.kind}</strong><p>{job.state.replaceAll("_"," ")}</p><p>{job.detail??(job.errorCode?reasons[job.errorCode]:"")}</p><p>Last progress: {new Date(job.lastProgressAt).toLocaleString()}. Last successful check: {job.lastSuccessAt?new Date(job.lastSuccessAt).toLocaleString():"not yet recorded"}.{job.retryAt?` Next check: ${new Date(job.retryAt).toLocaleString()}.`:""}</p><small>Reference: {job.jobId}</small></div><Link className="studio-button" href={`/dashboard/projects/${job.projectId}`}>Open project</Link></article>)}</div>
    {!jobs.length&&!error&&<p>New work will appear here as it is checked.</p>}<p><Link href="/support">Get recovery help</Link></p></div>;
}
