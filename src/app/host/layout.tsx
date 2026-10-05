import { hostPageAccess } from "@/lib/host-auth";
import { HostAccessDenied, HostShell, HostUnavailable } from "@/components/host/HostShell";
import { ApiError } from "@/lib/http";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  let access;
  try { access = await hostPageAccess(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 503) return <HostUnavailable />;
    throw error;
  }
  if (!access) return <HostAccessDenied />;
  return <HostShell email={access.email}>{children}</HostShell>;
}
