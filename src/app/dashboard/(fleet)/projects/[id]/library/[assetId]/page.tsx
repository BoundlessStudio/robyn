import {LibraryAsset} from "@/components/studio/LibraryAsset";

export default async function Page({params,searchParams}:{params:Promise<{id:string;assetId:string}>;searchParams:Promise<{revision?:string}>}){
  const {id,assetId}=await params;
  const {revision}=await searchParams;
  return <LibraryAsset key={`${id}:${assetId}:${revision??""}`} projectId={id} assetId={assetId} initialRevisionId={revision}/>;
}
