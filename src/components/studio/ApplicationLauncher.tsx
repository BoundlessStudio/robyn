"use client";

import Link from "next/link";
import type {RefObject} from "react";
import { ArrowUpRight, Upload, MessageCircle } from "lucide-react";
import { launchableApps } from "@/studio/application-launch";
import { studioApps } from "@/studio/apps/registry";
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

export function ApplicationLauncher({ projectId, launch, ready, onLaunch, onFiles, onFolder, importButtonRef, employeesHref, compact = false }: {
  projectId: string; launch: ApplicationLaunch; ready: boolean; onLaunch: (appId: string) => void;
  onFiles: () => void; onFolder: () => void; importButtonRef?: RefObject<HTMLButtonElement|null>; employeesHref: string; compact?: boolean;
}) {
  return <div className={`application-launcher${compact ? " compact" : ""}`}>
    {!compact && <header><span className="studio-eyebrow">YOUR APPLICATIONS</span><h2>What will you <em>make?</em></h2><p>Choose an application. Start with a blank file, saved in this project.</p></header>}
    <LaunchProgress launch={launch} ready={ready} onResume={() => { if (launch.pendingApp) onLaunch(launch.pendingApp.id); }}/>
    {!ready && <p className="studio-note">This project is archived. Open <Link href={`/dashboard/projects/${projectId}/settings#project-details`}>Settings</Link> to reactivate it and create new files.</p>}
    <div className="application-grid" aria-label="Project applications">
      {studioApps.map(app => <button key={app.id} disabled={!launchableApps.some(item=>item.id===app.id) || !ready || !launch.storageReady || launch.busy || Boolean(launch.pending)} onClick={() => onLaunch(app.id)}>
        <AppIcon app={app} className="application-icon"/>
        <span><strong>{app.name}</strong><small>{launchableApps.some(item=>item.id===app.id)?currentBlankStarters.find(item => item.appId === app.id)?.description:"Application being connected"}</small></span><ArrowUpRight size={15} aria-hidden="true"/>
      </button>)}
    </div>
    <footer><span>Manual editing uses no AI allowance.</span><div><button ref={importButtonRef} onClick={onFiles} disabled={launch.busy}><Upload size={14}/>Open existing files</button><button onClick={onFolder} disabled={launch.busy}>Folder or linked files</button><Link href={employeesHref}><MessageCircle size={14}/>Talk to Robyn</Link></div></footer>
  </div>;
}
