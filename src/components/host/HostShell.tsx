"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutGrid, LogOut, Settings, Shield } from "lucide-react";
import { branding } from "@/config/branding";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/host", label: "Overview", icon: LayoutGrid },
  { href: "/host/tenants", label: "Tenants", icon: Building2 },
  { href: "/host/configuration", label: "Configuration", icon: Settings },
];

export function HostShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (!error) window.location.href = "/login";
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-card p-4 md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-2 py-1">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded" />
          )}
          <span className="font-semibold">{branding.appName}</span>
          <span className="ml-auto rounded border px-2 py-0.5 text-xs text-muted-foreground">Host</span>
        </div>
        <nav aria-label="Host navigation" className="mt-6 flex gap-1 md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              (href === "/host" ? pathname === href : pathname.startsWith(href))
                ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
              <Icon className="h-4 w-4" />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t pt-3 md:mt-auto">
          <p className="truncate px-2 text-sm" title={email}>{email}</p>
          <p className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground"><Shield className="h-3 w-3" />Host administrator</p>
          <Button variant="ghost" onClick={signOut} className="mt-1 w-full justify-start"><LogOut />Sign out</Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1"><div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">{children}</div></main>
    </div>
  );
}

export function HostAccessDenied() {
  return <main className="mx-auto max-w-lg space-y-4 p-8">
    <h1 className="text-2xl font-semibold">Host access required</h1>
    <p className="text-sm text-muted-foreground">This account does not have permission to view the Host console.</p>
    <Button asChild variant="outline"><Link href="/">Continue to your account</Link></Button>
  </main>;
}

export function HostUnavailable() {
  return <main className="mx-auto max-w-lg space-y-4 p-8">
    <h1 className="text-2xl font-semibold">Host is unavailable</h1>
    <p className="text-sm text-muted-foreground" role="alert">Host permissions could not be loaded. Please retry.</p>
    <Button asChild variant="outline"><a href="/host">Retry</a></Button>
  </main>;
}
