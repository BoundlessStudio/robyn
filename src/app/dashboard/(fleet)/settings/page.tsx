import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudioSettings } from "@/components/studio/StudioSettings";
import { mailcraftBrowserBundle } from "@/studio/mailcraft-browser";
import { mcpSetupEndpoint } from "@/studio/mcp/config";

export const metadata: Metadata = { title: "Studio settings · Robyn", referrer: "no-referrer" };

export default async function Page({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  if (projectId) redirect(`/dashboard/projects/${encodeURIComponent(projectId)}/settings`);
  return <StudioSettings mcpEndpoint={mcpSetupEndpoint()} mailcraftBundle={mailcraftBrowserBundle()} />;
}
