import { StudioEmployees } from "@/components/studio/StudioEmployees";

export default async function Page({searchParams}:{searchParams:Promise<{projectId?:string;asset?:string;revision?:string;view?:string}>}) {
  const {projectId,asset,revision,view}=await searchParams;
  return <StudioEmployees initialProjectId={projectId} initialAssetId={asset} initialRevisionId={revision} initialView={view}/>;
}
