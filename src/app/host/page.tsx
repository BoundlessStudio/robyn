import { hostPageAccess } from "@/lib/host-auth";
import { HostAccessDenied } from "@/components/host/HostShell";
import { HostOverviewView } from "@/components/host/HostViews";

export default async function HostPage() {
  if (!(await hostPageAccess())) return <HostAccessDenied />;
  return <HostOverviewView />;
}
