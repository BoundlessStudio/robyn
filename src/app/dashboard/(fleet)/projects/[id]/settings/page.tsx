import {StudioSettings} from "@/components/studio/StudioSettings";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <StudioSettings key={id} projectId={id}/>;
}
