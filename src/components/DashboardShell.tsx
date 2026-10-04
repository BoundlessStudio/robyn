"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Settings, Users } from "lucide-react";
import { branding } from "@/config/branding";
import { AccountMenu } from "@/components/AccountMenu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { MemberAgentSelection } from "@/components/MemberAgentSelection";

const NAV = [
  { href: "/dashboard", label: "Agents", icon: LayoutGrid, exact: true },
  { href: "/dashboard/members", label: "Members", icon: Users, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: false },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { current, ready } = useWorkspace();
  const isAdmin = ready && current?.role === "admin";
  const isProfile = pathname === "/profile";
  useEffect(() => {
    if (ready && current?.role === "member" && pathname !== "/dashboard" && !isProfile) router.replace("/dashboard");
  }, [ready, current?.role, pathname, isProfile, router]);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card p-4">
        <div className="flex items-center gap-2 px-2 py-1">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded" />
          ) : null}
          <span className="truncate font-semibold">{branding.appName}</span>
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          {isAdmin && NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href || (item.href === "/dashboard" && pathname.startsWith("/dashboard/budgets/"))
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Account + workspace switcher, pinned to the bottom near the user's identity. */}
        <div className="mt-auto border-t pt-3">
          <AccountMenu />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
          {!ready ? <p className="text-sm text-muted-foreground">Loading…</p> : isAdmin || isProfile ? children : current ? (
            <MemberAgentSelection key={current.id} workspaceId={current.id} />
          ) : <p className="text-sm text-muted-foreground">No workspace selected.</p>}
        </div>
      </main>
    </div>
  );
}
