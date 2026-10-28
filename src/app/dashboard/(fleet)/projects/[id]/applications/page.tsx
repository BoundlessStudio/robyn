import {StudioApplications} from "@/components/studio/StudioApplications";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <StudioApplications key={id} projectId={id}/>;
}
