import { apiFetch } from "@/lib/api";
import { requireUuid, validatePackagePath, type AssetRef, type AssetSummary, type PackageFileRole } from "./assets";
import { savePackage, type SaveResult, type LocalPackageFile } from "./transfer-client";
import type { EditorMessage, EditorSaveMode, OpenAssetResult } from "./editor-bridge";

export interface EditorSaveResult extends SaveResult { mode: EditorSaveMode }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid editor request.");
  return value as Record<string, unknown>;
}
function assetRef(value:unknown):AssetRef {const input=object(value);return{assetId:requireUuid(input.assetId),revisionId:requireUuid(input.revisionId)};}

export function createEditorHost(options:{projectId:string;initialRef:AssetRef;signal:AbortSignal;onDirty:(dirty:boolean)=>void;onStatus:(message:string)=>void;onSaved:(result:EditorSaveResult)=>void}) {
  let assetId=options.initialRef.assetId;
  let base=options.initialRef.revisionId;
  // Save As adds the source here, after the editor froze its dependency list.
  // Carry that provenance into subsequent saves without requiring every adapter
  // to learn about a dependency introduced by the host.
  let adoptedDependencies:AssetRef[]=[];
  let saving=false;
  let dirty=false;
  const requests=new Map<string,{operation:string;result:Promise<unknown>;settled:boolean}>();
  async function assets(previews=false) {
    const endpoint=previews?`/api/studio/assets?projectId=${encodeURIComponent(options.projectId)}`:`/api/studio/projects/${options.projectId}`;
    const data=await apiFetch<{assets:AssetSummary[]}>(endpoint,{signal:options.signal});
    return data.assets;
  }
  async function open(ref:AssetRef) {
    if(!(await assets()).some(asset=>asset.id===ref.assetId))throw Error("This asset is outside the open project.");
    const pkg=await apiFetch<OpenAssetResult>(`/api/studio/revisions/${ref.revisionId}`,{signal:options.signal});
    if(pkg.ref.assetId!==ref.assetId||pkg.ref.revisionId!==ref.revisionId)throw Error("The revision does not belong to this asset.");
    return pkg;
  }
  async function dispatch(message:EditorMessage):Promise<unknown> {
    options.signal.throwIfAborted();
    switch(message.operation){
      case "openAsset": return open(assetRef(message.payload));
      case "insertAsset": return open(assetRef(message.payload));
      case "listProjectAssets": return assets(true);
      case "notifyChanges": {
        const input=object(message.payload);
        if(input.assetId!==assetId||typeof input.dirty!=="boolean")throw Error("Invalid change notification.");
        dirty=input.dirty;options.onDirty(dirty);return{received:true};
      }
      case "requestAgentEdit": {
        const input=object(message.payload),ref=assetRef(input.ref);
        if(saving||dirty)throw Error("Save your edits before handing this revision to an employee.");
        if(ref.assetId!==assetId||ref.revisionId!==base)throw Error("Hand off the exact saved revision open in this editor.");
        const instruction=typeof input.instruction==="string"?input.instruction.trim():"";
        if(!instruction||instruction.length>20000)throw Error("Describe the changes using 1–20,000 characters.");
        const requestId=requireUuid(input.requestId??message.requestId,"assignment request ID");
        const current=(await assets()).find(asset=>asset.id===assetId);
        if(!current)throw Error("This asset is outside the open project.");
        // Native changes or another save can arrive while membership is checked.
        // Authorize the still-current, clean revision immediately before dispatch.
        if(saving||dirty)throw Error("Save your edits before handing this revision to an employee.");
        if(ref.assetId!==assetId||ref.revisionId!==base)throw Error("Hand off the exact saved revision open in this editor.");
        const result=await apiFetch<{assignmentId:string}>("/api/studio/assignments",{method:"POST",body:JSON.stringify({projectId:options.projectId,appId:current.app_id,brief:instruction,inputs:[ref],requestId}),signal:options.signal});
        requireUuid(result.assignmentId,"assignment ID");
        options.onStatus("Your brief is with the employee. Follow it in Assignments.");
        return{assignmentId:result.assignmentId};
      }
      case "saveAsset": {
        const input=object(message.payload);
        if(input.assetId!==assetId||input.expectedBaseRevisionId!==base)throw Error("Save from the exact revision opened in this editor.");
        const mode=input.mode??"revision";
        if(mode!=="revision"&&mode!=="saveAs"&&mode!=="copy")throw Error("Invalid save mode.");
        const creationId=mode==="revision"?undefined:requireUuid(input.creationId,"new asset ID");
        const name=typeof input.name==="string"?input.name.trim():"";
        if(mode!=="revision"&&(!name||name.length>160))throw Error("Name the new asset using 1–160 characters.");
        if(saving)throw Error("Another save is still being confirmed.");
        if(!Array.isArray(input.files)||input.files.length<1||input.files.length>200)throw Error("A native package needs 1–200 files.");
        let total=0;
        const files:LocalPackageFile[]=input.files.map(raw=>{
          const file=object(raw);const path=validatePackagePath(file.path);
          if(!(file.file instanceof Blob)||!file.file.size||file.file.size>10*1024**3)throw Error("Invalid package file.");
          if(!["master","preview","export","dependency"].includes(String(file.role)))throw Error("Invalid file role.");
          total+=file.file.size;
          return{path,role:file.role as PackageFileRole,file:file.file};
        });
        if(total>50*1024**3)throw Error("The native package exceeds 50 GiB.");
        if(!Array.isArray(input.dependencies)||input.dependencies.length>100)throw Error("Invalid package dependencies.");
        const dependencies=input.dependencies.map(assetRef);
        for(const ref of adoptedDependencies){
          if(!dependencies.some(existing=>existing.assetId===ref.assetId&&existing.revisionId===ref.revisionId))dependencies.push({...ref});
        }
        if(mode!=="revision"&&!dependencies.some(ref=>ref.assetId===assetId&&ref.revisionId===base))dependencies.push({assetId,revisionId:base});
        if(dependencies.length>100)throw Error("A new asset can link at most 100 saved revisions, including its source.");
        saving=true;dirty=true;options.onDirty(true);
        try{
          const projectAssets=await assets();
          const current=projectAssets.find(asset=>asset.id===assetId);
          if(!current||dependencies.some(ref=>!projectAssets.some(asset=>asset.id===ref.assetId)))throw Error("The save includes an asset outside this project.");
          let targetId=assetId;
          if(creationId){
            const created=await apiFetch<{asset:AssetSummary}>("/api/studio/assets",{method:"POST",body:JSON.stringify({creationId,projectId:options.projectId,appId:current.app_id,name}),signal:options.signal});
            if(created.asset.id!==creationId)throw Error("The new asset was not confirmed.");
            targetId=creationId;
          }
          const result=await savePackage({assetId:targetId,expectedBaseRevisionId:creationId?null:base,files,dependencies,message:typeof input.message==="string"?input.message:"Edited in the browser",signal:options.signal,onProgress:message=>options.onStatus(message)});
          if(result.status==="committed"&&mode!=="copy"){
            base=result.revisionId;assetId=result.assetId;
            if(mode==="saveAs")adoptedDependencies=dependencies.map(ref=>({...ref}));
          }
          options.onSaved({...result,mode});
          return{ref:{assetId:result.assetId,revisionId:result.revisionId},status:result.status,dependencies};
        }finally{saving=false;}
      }
    }
  }
  return {
    handle(message:EditorMessage){
      const prior=requests.get(message.requestId);
      if(prior){if(prior.operation!==message.operation)return Promise.reject(Error("Request ID already used."));return prior.result;}
      if(requests.size>=100){
        const oldest=[...requests.entries()].find(([,request])=>request.settled);
        if(!oldest)return Promise.reject(Error("Too many active editor requests."));
        requests.delete(oldest[0]);
      }
      const result=dispatch(message);const request={operation:message.operation,result,settled:false};
      requests.set(message.requestId,request);
      void result.then(()=>{request.settled=true;},()=>{request.settled=true;});
      return result;
    },
  };
}
