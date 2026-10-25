"use client";
import { ResearchBrowserButton } from "./ResearchBrowserButton";
import { isEmployeeReady } from "@/studio/manifest";
import { StudioStudy } from "./StudioStudy";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { studioTools as studioApps } from "@/studio/tools";
import { creativeDirector } from "@/studio/director";

interface Employee {id:string;employee_key:string;kind:"director"|"specialist";app_id:string|null;role:string;manifest_version:string;provision_state:string}
export function StudioEmployees() {
  const [employees,setEmployees]=useState<Employee[]>([]);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;apiFetch<{employees:Employee[]}>("/api/studio/bootstrap").then(data=>{if(active)setEmployees([...data.employees].sort((a,b)=>(a.kind==="director"?-1:studioApps.find(app=>app.id===a.app_id)?.order??99)-(b.kind==="director"?-1:studioApps.find(app=>app.id===b.app_id)?.order??99)));}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  return <div className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">YOUR CREATIVE COMPANY</span><h1>Different crafts.<br/><em>One shared vision.</em></h1><p>A Creative Director, Research, and a dedicated specialist for every Craft.</p></div><div className="studio-action-row"><Link href="/dashboard/settings#studio-budget" className="studio-button">Manage AI budget ↗</Link><Link href="/dashboard" className="studio-button">Choose a project ↗</Link></div></header>{error&&<p role="alert" className="studio-error">{error}</p>}<p className="studio-note">Choose a project to start a brief. Your team works with saved files and brings each new revision back for review.</p>{loading?<p role="status" className="studio-muted">Meeting your team…</p>:<div className="studio-app-grid">{employees.map(employee=>{const app=studioApps.find(app=>app.id===employee.app_id);const director=employee.kind==="director";return <article key={employee.id} className="studio-app-card"><StudioStudy kind={director?"director":app?.artwork} index={director?0:app?.order}/><div className="studio-craft-caption"><span>{director?creativeDirector.monogram:app?.monogram}</span><small>{director?"DIRECTION":app?.category}</small></div><h2>{employee.role}</h2><h3>{director?"Creative direction & coordination":app?.name}</h3><p>{director?"Turns your brief into a creative direction, brings the specialists together, and returns final work for your review.":app?.tagline}</p><span className="studio-status">{employee.provision_state==="ready"?"Workstation connected":employee.provision_state==="provisioning"?"Preparing workstation":employee.provision_state==="failed"?"Setup needs attention":(director||(app&&isEmployeeReady(app)))?"Ready for your first brief":"Creative tools being connected"}</span>{app?.id==="research"&&<ResearchBrowserButton/>}</article>;})}</div>}</div>;
}
