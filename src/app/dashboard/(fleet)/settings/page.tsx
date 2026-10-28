import {redirect} from "next/navigation";

export default async function Page({searchParams}:{searchParams:Promise<{projectId?:string}>}){
  const {projectId}=await searchParams;
  redirect(projectId?`/dashboard/projects/${encodeURIComponent(projectId)}/settings`:"/dashboard");
}
