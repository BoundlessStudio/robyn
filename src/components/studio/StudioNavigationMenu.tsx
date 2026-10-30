"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, LayoutDashboard, Images, MessageCircle, Settings, ChevronDown, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { RobinMark } from "@/components/brand/RobinMark";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { AssetRef } from "@/studio/assets";

export const studioNavigation = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
];

export const projectNavigation = (projectId:string,savedRevision?:AssetRef) => [
  { href: `/dashboard/projects/${projectId}`, label: "Dashboard", icon: LayoutDashboard },
  { href: `/dashboard/projects/${projectId}/library`, label: "Assets", icon: Images },
  { href: `/dashboard/projects/${projectId}/employees${savedRevision?`?${new URLSearchParams({asset:savedRevision.assetId,revision:savedRevision.revisionId})}`:""}`, label: "Robyn", icon: MessageCircle },
  { href: `/dashboard/projects/${projectId}/settings`, label: "Settings", icon: Settings },
];

export function ProjectNavigationLinks({projectId,savedRevision,onDashboard,menu=false}:{projectId:string;savedRevision?:AssetRef;onDashboard?:()=>void;menu?:boolean}) {
  const path=usePathname(),home=`/dashboard/projects/${projectId}`;
  const links=projectNavigation(projectId,savedRevision).map(({href,label,icon:Icon})=>{
    const destination=href.split("?")[0];
    const current=path===destination||(destination!==home&&path.startsWith(`${destination}/`))||(destination===`${home}/employees`&&path===`${home}/research`);
    const link=<Link key={href} className={menu?undefined:"studio-tool-button"} href={href} aria-current={current?"page":undefined} title={label} onClick={destination===home?event=>{if(!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)onDashboard?.();}:undefined}><Icon size={menu?15:16} aria-hidden="true"/><span>{label}</span></Link>;
    return menu?<DropdownMenuItem asChild key={href}>{link}</DropdownMenuItem>:link;
  });
  return menu?<>{links}</>:<nav className="project-header-actions" aria-label="Project navigation">{links}</nav>;
}

export function StudioNavigationMenu({projectId,savedRevision,onDashboard}:{projectId:string;savedRevision?:AssetRef;onDashboard?:()=>void}) {
  const { current } = useWorkspace();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="studio-project-menu" aria-label="Robyn studio menu"><RobinMark/><span>robyn</span><ChevronDown size={12}/></button></DropdownMenuTrigger>
    <DropdownMenuContent className="studio-tool-menu" align="start" sideOffset={8}>
      <DropdownMenuLabel>{current?.name ?? "Your studio"}</DropdownMenuLabel>
      <DropdownMenuSeparator/>
      {studioNavigation.map(({href,label,icon:Icon})=><DropdownMenuItem asChild key={href}><Link href={href}><Icon size={15}/>{label}</Link></DropdownMenuItem>)}
      <DropdownMenuSeparator/>
      <ProjectNavigationLinks projectId={projectId} savedRevision={savedRevision} onDashboard={onDashboard} menu/>
      <DropdownMenuSeparator/>
      <DropdownMenuItem asChild><Link href="/"><ArrowUpRight size={15}/>Visit the creative studio</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
