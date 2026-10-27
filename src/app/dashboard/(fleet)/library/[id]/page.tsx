import { LibraryAsset } from "@/components/studio/LibraryAsset";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revision?:string}>}){
  const {id}=await params;
  const {revision}=await searchParams;
  return <LibraryAsset key={`${id}:${revision??""}`} assetId={id} initialRevisionId={revision}/>;
}
