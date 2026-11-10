"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, LayoutDashboard, Images, MessageCircle, Settings, ChevronDown, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { RobinMark } from "@/components/brand/RobinMark";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { AssetRef } from "@/studio/assets";

const studioNavigation = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
  { href: "/dashboard/settings", label: "Studio settings", icon: Settings },
];

function projectNavigation(home: string, savedRevision?: AssetRef) {
  const selection = savedRevision
    ? `?${new URLSearchParams({ asset: savedRevision.assetId, revision: savedRevision.revisionId })}`
    : "";
  return [
    { href: home, label: "Dashboard", icon: LayoutDashboard },
    { href: `${home}/library`, label: "Assets", icon: Images },
    { href: `${home}/employees${selection}`, label: "Robyn", icon: MessageCircle },
    { href: `${home}/settings`, label: "Settings", icon: Settings },
  ];
}

export function StudioNavigationMenu({ projectId, savedRevision, onDashboard }: {
  projectId?: string;
  savedRevision?: AssetRef;
  onDashboard?: () => void;
}) {
  const { current } = useWorkspace();
  const path = usePathname();
  const home = projectId ? `/dashboard/projects/${projectId}` : null;

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="studio-project-menu" aria-label="Robyn studio menu">
        <RobinMark/><span>robyn</span><ChevronDown size={12} aria-hidden="true"/>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="studio-tool-menu" align="start" sideOffset={8}>
      <DropdownMenuLabel>{current?.name ?? "Your studio"}</DropdownMenuLabel>
      <DropdownMenuSeparator/>
      {studioNavigation.map(({ href, label, icon: Icon }) => <DropdownMenuItem asChild key={href}>
        <Link href={href} aria-current={path === href ? "page" : undefined}><Icon size={15} aria-hidden="true"/>{label}</Link>
      </DropdownMenuItem>)}
      {home && <>
        <DropdownMenuSeparator/>
        <DropdownMenuLabel>Project</DropdownMenuLabel>
        {projectNavigation(home, savedRevision).map(({ href, label, icon: Icon }) => {
          const destination = href.split("?")[0];
          const active = path === destination
            || (destination !== home && path.startsWith(`${destination}/`))
            || (destination === `${home}/employees` && path === `${home}/research`);
          return <DropdownMenuItem asChild key={href}>
            <Link href={href} aria-current={active ? "page" : undefined} onClick={destination === home && onDashboard ? event => {
              if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                onDashboard();
              }
            } : undefined}><Icon size={15} aria-hidden="true"/>{label}</Link>
          </DropdownMenuItem>;
        })}
      </>}
      <DropdownMenuSeparator/>
      <DropdownMenuItem asChild><Link href="/"><ArrowUpRight size={15} aria-hidden="true"/>Visit the creative studio</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
