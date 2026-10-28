import {LibraryAssetRedirect} from "@/components/studio/LibraryAssetRedirect";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revision?:string}>}){
  const {id}=await params;
  const {revision}=await searchParams;
  return <LibraryAssetRedirect assetId={id} revisionId={revision}/>;
}
