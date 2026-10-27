import { StudioLibrary } from "@/components/studio/StudioLibrary";
export default async function Page({searchParams}:{searchParams:Promise<{projectId?:string}>}){
  const {projectId}=await searchParams;
  return <StudioLibrary initialProjectId={projectId}/>;
}
