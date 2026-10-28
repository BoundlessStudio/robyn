"use client";

import Link from "next/link";
import { FolderOpen, Images, Users, Globe, Shapes, Settings, ChevronDown, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { RobinMark } from "@/components/brand/RobinMark";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export const studioNavigation = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
];

export const projectNavigation = (projectId:string) => [
  { href: `/dashboard/projects/${projectId}/library`, label: "Asset Library", icon: Images },
  { href: `/dashboard/projects/${projectId}/employees`, label: "AI Employees", icon: Users },
  { href: `/dashboard/projects/${projectId}/research`, label: "Research", icon: Globe },
  { href: `/dashboard/projects/${projectId}/applications`, label: "Applications", icon: Shapes },
  { href: `/dashboard/projects/${projectId}/settings`, label: "Settings", icon: Settings },
];

export function StudioNavigationMenu({projectId}:{projectId:string}) {
  const { current } = useWorkspace();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="studio-project-menu" aria-label="Robyn studio menu"><RobinMark/><span>robyn</span><ChevronDown size={12}/></button></DropdownMenuTrigger>
    <DropdownMenuContent className="studio-tool-menu" align="start" sideOffset={8}>
      <DropdownMenuLabel>{current?.name ?? "Your studio"}</DropdownMenuLabel>
      <DropdownMenuSeparator/>
      {studioNavigation.map(({href,label,icon:Icon})=><DropdownMenuItem asChild key={href}><Link href={href}><Icon size={15}/>{label}</Link></DropdownMenuItem>)}
      <DropdownMenuSeparator/>
      {projectNavigation(projectId).map(({href,label,icon:Icon})=><DropdownMenuItem asChild key={href}><Link href={href}><Icon size={15}/>{label}</Link></DropdownMenuItem>)}
      <DropdownMenuSeparator/>
      <DropdownMenuItem asChild><Link href="/"><ArrowUpRight size={15}/>Visit the creative studio</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
