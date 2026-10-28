import {StudioEmployees} from "@/components/studio/StudioEmployees";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{asset?:string;revision?:string;view?:string}>}){
  const {id}=await params;
  const {asset,revision,view}=await searchParams;
  return <StudioEmployees key={id} projectId={id} initialAssetId={asset} initialRevisionId={revision} initialView={view}/>;
}
