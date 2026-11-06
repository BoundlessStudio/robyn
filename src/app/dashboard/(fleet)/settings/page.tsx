import { redirect } from "next/navigation";
import { StudioSettings } from "@/components/studio/StudioSettings";
import { mcpSetupEndpoint } from "@/studio/mcp/config";

export default async function Page({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  if (projectId) redirect(`/dashboard/projects/${encodeURIComponent(projectId)}/settings`);
  return <StudioSettings mcpEndpoint={mcpSetupEndpoint()} />;
}
