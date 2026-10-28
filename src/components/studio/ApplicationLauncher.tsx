"use client";

import Link from "next/link";
import { ArrowUpRight, Upload, Users } from "lucide-react";
import { research } from "@/studio/specialists/research";
import { launchableApps } from "@/studio/application-launch";
import { currentBlankStarters } from "@/studio/blank-starters";
import type { ApplicationLaunch } from "./useApplicationLaunch";
import { AppIcon } from "./AppIcon";

export function LaunchProgress({ launch, ready, onResume }: { launch: ApplicationLaunch; ready: boolean; onResume: () => void }) {
  return <>
    {launch.pending && <div className="application-launch-progress">
      <p role="status">{launch.busy ? launch.status : `Continue opening ${launch.pendingApp?.name ?? "your application"}. Your document is preserved.`}</p>
      {!launch.busy && <button className="studio-button primary" disabled={!ready || !launch.storageReady} onClick={onResume}>Continue opening {launch.pendingApp?.name ?? "application"}</button>}
    </div>}
    {launch.error && <p role="alert" className="studio-error">{launch.error}</p>}
  </>;
}

export function ApplicationLauncher({ projectId, launch, ready, onLaunch, onFiles, onFolder, employeesHref, compact = false }: {
  projectId: string; launch: ApplicationLaunch; ready: boolean; onLaunch: (appId: string) => void;
  onFiles: () => void; onFolder: () => void; employeesHref: string; compact?: boolean;
}) {
  return <div className={`application-launcher${compact ? " compact" : ""}`}>
    {!compact && <header><span className="studio-eyebrow">YOUR APPLICATIONS</span><h2>What will you <em>make?</em></h2><p>Choose an application. Start with a blank file, saved in this project.</p></header>}
    <LaunchProgress launch={launch} ready={ready} onResume={() => { if (launch.pendingApp) onLaunch(launch.pendingApp.id); }}/>
    {!ready && <p className="studio-note">This project is archived. Open Project details to reactivate it and create new files.</p>}
    <div className="application-grid" aria-label="Project applications">
      {launchableApps.map(app => <button key={app.id} disabled={!ready || !launch.storageReady || launch.busy || Boolean(launch.pending)} onClick={() => onLaunch(app.id)}>
        <AppIcon app={app} className="application-icon"/>
        <span><strong>{app.name}</strong><small>{currentBlankStarters.find(item => item.appId === app.id)?.description}</small></span><ArrowUpRight size={15} aria-hidden="true"/>
      </button>)}
      <Link href={`/dashboard/projects/${projectId}/research`} target="_blank" rel="noopener" title="Open Research in a new tab; your editor stays open" className="application-research"><AppIcon app={research} className="application-icon"/><span><strong>Research</strong><small>Open your research browser</small></span><ArrowUpRight size={15}/></Link>
    </div>
    <footer><span>Manual editing uses no AI allowance.</span><div><button onClick={onFiles} disabled={launch.busy}><Upload size={14}/>Open existing files</button><button onClick={onFolder} disabled={launch.busy}>Folder or linked files</button><Link href={employeesHref} target="_blank" rel="noopener" title="Open your team in a new tab; your editor stays open"><Users size={14}/>AI Employees <ArrowUpRight size={12}/></Link></div></footer>
  </div>;
}
