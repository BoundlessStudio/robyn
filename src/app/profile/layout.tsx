import { DashboardShell } from "@/components/DashboardShell";
import { WorkspaceLayout } from "@/components/WorkspaceLayout";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceLayout>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceLayout>
  );
}
