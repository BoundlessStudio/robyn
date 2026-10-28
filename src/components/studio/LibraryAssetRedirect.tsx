"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {apiFetch} from "@/lib/api";
import {requireUuid,type AssetSummary} from "@/studio/assets";

export function LibraryAssetRedirect({assetId,revisionId}:{assetId:string;revisionId?:string}){
  const router=useRouter(),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void (async()=>{
      requireUuid(assetId,"asset ID");
      const {asset}=await apiFetch<{asset:AssetSummary}>(`/api/studio/assets/${assetId}`,{signal:controller.signal});
      if(asset.id!==assetId)throw Error("This asset could not be opened.");
      requireUuid(asset.project_id,"project ID");
      if(!controller.signal.aborted)router.replace(`/dashboard/projects/${asset.project_id}/library/${assetId}${revisionId?`?${new URLSearchParams({revision:revisionId})}`:""}`);
    })().catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[assetId,revisionId,router]);
  return <div className="studio-page">{error?<><p className="studio-error" role="alert">{error}</p><Link href="/dashboard">Back to projects</Link></>:<p role="status">Opening this asset’s project…</p>}</div>;
}
