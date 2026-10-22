import { StudioStudy } from "./StudioStudy";
import { studioApps } from "@/studio/apps/registry";
import { isAppReady } from "@/studio/manifest";
import Link from "next/link";

export function StudioApplications() {
  return <div className="studio-page"><header className="studio-page-heading"><div><span className="studio-eyebrow">THE TOOLS OF YOUR TRADE</span><h1>Make it.<br/><em>Keep making it.</em></h1><p>Real creative applications. Native files you can keep editing.</p></div><span className="studio-status">{studioApps.filter(isAppReady).length} / {studioApps.length} integrations verified</span></header><div className="studio-app-grid">{studioApps.map(app=><article key={app.id} className="studio-app-card"><StudioStudy kind={app.artwork} index={app.order}/><div className="studio-craft-caption"><span>{app.monogram}</span><small>{app.category}</small></div><h2>{app.name}</h2><h3>{app.category} · {app.employee.role}</h3><p>{app.tagline}</p><span className="studio-status">{isAppReady(app)?"Ready in your project":"Integration in progress"}</span>{isAppReady(app)?<Link className="studio-button" href="/dashboard">Open a project ↗</Link>:<p style={{marginTop:18,marginBottom:0}}>The editor opens here once its native file round trip is verified.</p>}</article>)}</div></div>;
}
