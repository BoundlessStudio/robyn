import {ResearchBrowser} from "@/components/studio/ResearchBrowser";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <ResearchBrowser key={id} projectId={id}/>;
}
