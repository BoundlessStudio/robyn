import { hostPageAccess } from "@/lib/host-auth";
import { HostAccessDenied } from "@/components/host/HostShell";
import { HostTenantView } from "@/components/host/HostViews";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hostPageAccess())) return <HostAccessDenied />;
  const { id } = await params;
  return <HostTenantView key={id} id={id} />;
}
