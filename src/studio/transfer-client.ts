import { sha256 } from "@noble/hashes/sha2.js";
import { Upload } from "tus-js-client";
import { apiFetch, readApiError } from "@/lib/api";
import { validateRevisionPackage, type AssetRef, type PackageFileRole, type RevisionPackage } from "./assets";

export interface LocalPackageFile { path:string; role:PackageFileRole; file:Blob }
interface Transfer {path:string;uploaded:boolean;bytes:number;mimeType?:string;storageKey?:string;token?:string;sha256?:string}
export interface SaveResult extends AssetRef {status:"committed"|"conflict"}

export async function digestFile(file:Blob,signal?:AbortSignal):Promise<string> {
  const hash=sha256.create();
  for(let offset=0;offset<file.size;offset+=1024*1024){signal?.throwIfAborted();hash.update(new Uint8Array(await file.slice(offset,offset+1024*1024).arrayBuffer()));}
  return Array.from(hash.digest(),byte=>byte.toString(16).padStart(2,"0")).join("");
}

function uploadFile(file:Blob,transfer:Transfer,endpoint:string,bucket:string,signal:AbortSignal|undefined,onProgress:(sent:number)=>void) {
  return new Promise<void>((resolve,reject)=>{
    signal?.throwIfAborted();
    let settled=false;
    const finish=(error?:Error)=>{if(settled)return;settled=true;signal?.removeEventListener("abort",abort);if(error)reject(error);else resolve();};
    const upload=new Upload(file,{
      endpoint,chunkSize:6*1024*1024,uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,
      retryDelays:[0,1000,3000,5000,10000],
      headers:{"x-signature":transfer.token!,"apikey":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,"x-upsert":"false"},
      metadata:{bucketName:bucket,objectName:transfer.storageKey!,contentType:transfer.mimeType!,cacheControl:"3600"},
      fingerprint:async()=>`robyn:${transfer.storageKey}:${transfer.sha256}`,
      onProgress:sent=>onProgress(sent),
      // The provider error can contain the signed URL; keep it out of the UI.
      onError:()=>finish(new Error(`The upload of “${transfer.path}” paused. Select the same files to resume.`)),
      onSuccess:()=>finish(),
    });
    const abort=()=>{void upload.abort().finally(()=>finish(new Error("Upload paused. Select the same files to resume.")));};
    signal?.addEventListener("abort",abort,{once:true});
    upload.findPreviousUploads().then(previous=>{if(settled||signal?.aborted)return;if(previous.length)upload.resumeFromPreviousUpload(previous[0]);upload.start();}).catch(()=>{if(!settled&&!signal?.aborted)upload.start();});
  });
}

/** File bytes go straight from the browser to private Storage. Local resume
 * state contains a revision ID, never a credential or a copy of the media. */
export async function savePackage(input:{assetId:string;expectedBaseRevisionId:string|null;files:LocalPackageFile[];dependencies:AssetRef[];message:string;signal?:AbortSignal;onProgress?:(message:string,percent:number)=>void}):Promise<SaveResult> {
  const files=[];
  for(const file of input.files){input.onProgress?.(`Checking ${file.path}…`,0);files.push({path:file.path,role:file.role,bytes:file.file.size,mimeType:file.file.type||"application/octet-stream",sha256:await digestFile(file.file,input.signal)});}
  const pkg:RevisionPackage=validateRevisionPackage({files,dependencies:input.dependencies,message:input.message});
  const fingerprint=sha256(new TextEncoder().encode(JSON.stringify({base:input.expectedBaseRevisionId,pkg})));
  const key=`robyn-save:${input.assetId}:${Array.from(fingerprint,b=>b.toString(16).padStart(2,"0")).join("")}`;
  let revisionId:string|null=null;
  try{revisionId=localStorage.getItem(key);}catch{/* Private browsing may disable persistence. */}
  if(revisionId){
    const history=await apiFetch<{revisions:Array<{id:string;state:string}>}>(`/api/studio/assets/${input.assetId}/revisions?revisionId=${encodeURIComponent(revisionId)}`);
    const prior=history.revisions.find(row=>row.id===revisionId);
    if(prior?.state==="committed"||prior?.state==="conflict"){try{localStorage.removeItem(key);}catch{}return{assetId:input.assetId,revisionId,status:prior.state};}
    if(!prior||prior.state!=="uploading")revisionId=null;
  }
  if(!revisionId){const revision=await apiFetch<{revisionId:string}>(`/api/studio/assets/${input.assetId}/revisions`,{method:"POST",body:JSON.stringify({expectedBaseRevisionId:input.expectedBaseRevisionId,package:pkg}),signal:input.signal});revisionId=revision.revisionId;try{localStorage.setItem(key,revisionId);}catch{}}
  const ticket=await apiFetch<{bucket:string;resumableEndpoint:string;transfers:Transfer[]}>(`/api/studio/revisions/${revisionId}/transfers`,{method:"POST",body:"{}",signal:input.signal});
  const total=files.reduce((sum,file)=>sum+file.bytes,0);let completed=0;
  for(const transfer of ticket.transfers){
    input.signal?.throwIfAborted();
    const file=input.files.find(file=>file.path===transfer.path);if(!file)throw new Error(`Select the original file for “${transfer.path}”.`);
    if(!transfer.uploaded)await uploadFile(file.file,transfer,ticket.resumableEndpoint,ticket.bucket,input.signal,sent=>input.onProgress?.(`Uploading ${transfer.path}…`,Math.min(99,Math.round((completed+sent)/total*100))));
    completed+=file.file.size;
  }
  input.onProgress?.("Confirming the saved revision…",99);
  const response=await fetch(`/api/studio/revisions/${revisionId}/commit`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:input.signal});
  if(!response.ok&&response.status!==409)throw new Error(await readApiError(response,"Could not confirm the revision"));
  const result=await response.json() as SaveResult&{error?:{message:string}};
  if(result.status!=="committed"&&result.status!=="conflict")throw new Error(result.error?.message??"The revision could not be confirmed. Resume the upload to retry.");
  try{localStorage.removeItem(key);}catch{}
  input.onProgress?.(result.status==="conflict"?"Your save is preserved as a conflict.":"Revision saved.",100);
  return result;
}
