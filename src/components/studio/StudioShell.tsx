"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Images, Users, Shapes, Settings, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { OrbitMark } from "@/components/home/Artwork";

const navigation = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
  { href: "/dashboard/library", label: "Asset Library", icon: Images },
  { href: "/dashboard/employees", label: "AI Employees", icon: Users },
  { href: "/dashboard/applications", label: "Applications", icon: Shapes },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { current, userEmail } = useWorkspace();
  return <div className="studio-shell dark">
    <a href="#studio-content" className="studio-skip">Skip to workspace</a>
    <aside className="studio-sidebar" aria-label="Studio identity and navigation">
      <Link className="studio-logo" href="/dashboard"><OrbitMark/> robyn <span className="studio-pilot">STUDIO</span></Link>
      <div className="studio-identity"><span className="studio-avatar" aria-hidden="true">{(userEmail[0] ?? "R").toUpperCase()}</span><div><strong>{current?.name}</strong><small>Private creative studio</small></div></div>
      <nav aria-label="Studio navigation">{navigation.map(({href,label,icon:Icon}) => {
        const active = href === "/dashboard" ? path === href || path.startsWith("/dashboard/projects/") : path.startsWith(href);
        return <Link href={href} key={href} aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden="true"/>{label}</Link>;
      })}</nav>
      <div className="studio-sidebar-bottom"><p>One imagination.<br/><em>An entire studio.</em></p><Link href="/">Visit the creative studio <ArrowUpRight size={15}/></Link><span title={userEmail}>{userEmail}</span></div>
    </aside>
    <main id="studio-content" className="studio-main">{children}</main>
  </div>;
}
