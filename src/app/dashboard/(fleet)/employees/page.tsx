import {redirect} from "next/navigation";

export default async function Page({searchParams}:{searchParams:Promise<{projectId?:string;asset?:string;revision?:string;view?:string}>}) {
  const {projectId,asset,revision,view}=await searchParams;
  if(!projectId)redirect("/dashboard");
  const query=new URLSearchParams({...(asset?{asset}:{}),...(revision?{revision}:{}),...(view?{view}:{})});
  redirect(`/dashboard/projects/${encodeURIComponent(projectId)}/employees${query.size?`?${query}`:""}`);
}
