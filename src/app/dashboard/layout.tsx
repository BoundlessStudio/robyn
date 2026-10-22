import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireStudio } from "@/studio/server";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import type { WorkspaceWithRole } from "@/lib/types";
import "./studio.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSession();
  if (!user) redirect("/login");
  const { workspace } = await requireStudio();
  return <WorkspaceProvider initialWorkspaces={[{ ...workspace, role: "admin" } as WorkspaceWithRole]} userEmail={user.email ?? ""}>{children}</WorkspaceProvider>;
}
