import {StudioLibrary} from "@/components/studio/StudioLibrary";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <StudioLibrary key={id} projectId={id}/>;
}
