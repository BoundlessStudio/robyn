import { ProjectWorkspace } from "@/components/studio/ProjectWorkspace";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{asset?:string}>}){const {id}=await params;const {asset}=await searchParams;return <ProjectWorkspace projectId={id} initialAssetId={asset}/>;}
