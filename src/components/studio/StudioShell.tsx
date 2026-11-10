"use client";

import { usePathname } from "next/navigation";
import { StudioNavigationMenu } from "./StudioNavigationMenu";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const projectMode = path.startsWith("/dashboard/projects/");
  return <div className={`studio-shell dark${projectMode ? " project-mode" : ""}`}>
    <a href="#studio-content" className="studio-skip">Skip to workspace</a>
    {!projectMode && <header className="studio-header"><StudioNavigationMenu/></header>}
    <main id="studio-content" className="studio-main">{children}</main>
  </div>;
}
