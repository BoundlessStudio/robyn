"use client";
import { AppIcon } from "./AppIcon";
import {useState} from "react";
import { research } from "@/studio/specialists/research";
import { ResearchBrowserButton } from "./ResearchBrowserButton";
import { StudioStudy } from "./StudioStudy";
import { studioApps } from "@/studio/apps/registry";
import { isAppReady } from "@/studio/manifest";
import {OpenApplicationProjectDialog} from "./OpenApplicationProjectDialog";
import type {StudioAppManifest} from "@/studio/manifest";

export function StudioApplications() {
  const [chosen,setChosen]=useState<StudioAppManifest|null>(null);
  return <div className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">THE TOOLS OF YOUR TRADE</span><h1>Make it.<br/><em>Keep making it.</em></h1><p>Real creative applications. Native files you can keep editing.</p></div><span className="studio-status">{studioApps.filter(isAppReady).length} / {studioApps.length} integrations verified</span></header><section className="research-tools-intro"><div><span className="studio-eyebrow">RESEARCH / A WINDOW TO THE WORLD</span><h2>Curiosity, with <em>somewhere to go.</em></h2><p>Research has its own Google Chrome browser and Agent37 managed Brave Search. Find references, verify sources and carry out the web workflows you request. Watch live, take over, and hand the browser back.</p><p>Findings become saved research notebooks your creative team can use.</p></div><div><span className="studio-status">{research.workstation.status==="verified"?"Research is ready":"Research is being verified"}</span><ResearchBrowserButton/></div></section><div className="studio-app-grid">{studioApps.map(app=><article key={app.id} className="studio-app-card"><StudioStudy kind={app.artwork} index={app.order}/><div className="studio-craft-caption"><AppIcon app={app}/><small>{app.category}</small></div><h2>{app.name}</h2><h3>{app.category} · {app.employee.role}</h3><p>{app.tagline}</p><span className="studio-status">{isAppReady(app)?"Ready in your project":"Integration in progress"}</span>{isAppReady(app)?<button className="studio-button" onClick={()=>setChosen(app)} aria-label={`Open ${app.name} in project`}>Open in project ↗</button>:<p style={{marginTop:18,marginBottom:0}}>The editor opens here once its native file round trip is verified.</p>}</article>)}</div>{chosen&&<OpenApplicationProjectDialog app={chosen} close={()=>setChosen(null)}/>}</div>;
}
