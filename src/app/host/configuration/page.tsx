import { hostPageAccess } from "@/lib/host-auth";
import { HostAccessDenied } from "@/components/host/HostShell";
import { HostConfigurationView } from "@/components/host/HostViews";

export default async function ConfigurationPage() {
  if (!(await hostPageAccess())) return <HostAccessDenied />;
  return <HostConfigurationView />;
}
