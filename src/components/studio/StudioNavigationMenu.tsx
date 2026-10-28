"use client";

import Link from "next/link";
import { FolderOpen, Shapes, Settings, ChevronDown, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { RobinMark } from "@/components/brand/RobinMark";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export const studioNavigation = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
  { href: "/dashboard/applications", label: "Applications", icon: Shapes },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function StudioNavigationMenu() {
  const { current } = useWorkspace();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="studio-project-menu" aria-label="Robyn studio menu"><RobinMark/><span>robyn</span><ChevronDown size={12}/></button></DropdownMenuTrigger>
    <DropdownMenuContent className="studio-tool-menu" align="start" sideOffset={8}>
      <DropdownMenuLabel>{current?.name ?? "Your studio"}</DropdownMenuLabel>
      <DropdownMenuSeparator/>
      {studioNavigation.map(({href,label,icon:Icon})=><DropdownMenuItem asChild key={href}><Link href={href}><Icon size={15}/>{label}</Link></DropdownMenuItem>)}
      <DropdownMenuSeparator/>
      <DropdownMenuItem asChild><Link href="/"><ArrowUpRight size={15}/>Visit the creative studio</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
