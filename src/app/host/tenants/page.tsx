import { hostPageAccess } from "@/lib/host-auth";
import { HostAccessDenied } from "@/components/host/HostShell";
import { HostTenantsView } from "@/components/host/HostViews";

export default async function TenantsPage() {
  if (!(await hostPageAccess())) return <HostAccessDenied />;
  return <HostTenantsView />;
}
