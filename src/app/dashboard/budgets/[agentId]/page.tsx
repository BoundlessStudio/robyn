import { notFound } from "next/navigation";
import { requireAgentAccess } from "@/lib/auth";
import { AgentBudgetPage } from "@/components/AgentBudgetPage";

export default async function BudgetPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const access = await requireAgentAccess(agentId, "admin").catch(() => null);
  if (!access) notFound();

  return <AgentBudgetPage agentId={agentId} workspaceId={access.row.workspace_id} name={access.row.name?.trim() || "Unnamed agent"} />;
}
