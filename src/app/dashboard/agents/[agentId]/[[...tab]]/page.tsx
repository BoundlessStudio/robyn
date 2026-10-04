import { notFound } from "next/navigation";
import { requireAgentAccess } from "@/lib/auth";
import { parseAgentTab } from "@/lib/dashboard-tabs";
import { AgentWorkspace } from "@/components/AgentWorkspace";

// The per-agent workspace. The active agent is bound to the URL; the optional catch-all carries
// the tab (/dashboard/agents/{agentId}/{tab}, default "chat"). This route lives OUTSIDE the
// (fleet) route group, so it renders its own full-height shell instead of the fleet sidebar.
export default async function AgentWorkspacePage({
  params,
}: {
  params: Promise<{ agentId: string; tab?: string[] }>;
}) {
  const { agentId, tab } = await params;

  // One grammar, shared with the client SPA: an unknown tab or extra segments 404 here.
  const initialTab = parseAgentTab(tab);
  if (initialTab === null) notFound();

  const access = await requireAgentAccess(agentId).catch(() => null);
  if (!access) notFound();
  const { row, role } = access;

  return (
    <AgentWorkspace
      agentId={agentId}
      workspaceId={row.workspace_id}
      role={role}
      initialTab={initialTab}
    />
  );
}
