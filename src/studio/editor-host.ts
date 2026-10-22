import { apiFetch } from "@/lib/api";
import { requireUuid, validatePackagePath, type AssetRef, type AssetSummary, type PackageFileRole } from "./assets";
import { savePackage, type SaveResult, type LocalPackageFile } from "./transfer-client";
import type { EditorMessage, OpenAssetResult } from "./editor-bridge";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid editor request.");
  return value as Record<string, unknown>;
}
function assetRef(value:unknown):AssetRef {const input=object(value);return{assetId:requireUuid(input.assetId),revisionId:requireUuid(input.revisionId)};}

export function createEditorHost(options:{projectId:string;initialRef:AssetRef;signal:AbortSignal;onDirty:(dirty:boolean)=>void;onStatus:(message:string)=>void;onSaved:(result:SaveResult)=>void}) {
  let base=options.initialRef.revisionId;
  let saving=false;
  const requests=new Map<string,{operation:string;result:Promise<unknown>;settled:boolean}>();
  async function assets() {
    const data=await apiFetch<{assets:AssetSummary[]}>(`/api/studio/projects/${options.projectId}`,{signal:options.signal});
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
      case "listProjectAssets": return assets();
      case "notifyChanges": {
        const input=object(message.payload);
        if(input.assetId!==options.initialRef.assetId||typeof input.dirty!=="boolean")throw Error("Invalid change notification.");
        options.onDirty(input.dirty);return{received:true};
      }
      case "requestAgentEdit": throw Error("Employee handoffs are still being connected. Your saved revision is available in the library.");
      case "saveAsset": {
        const input=object(message.payload);
        if(input.assetId!==options.initialRef.assetId||input.expectedBaseRevisionId!==base)throw Error("Save from the exact revision opened in this editor.");
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
        saving=true;options.onDirty(true);
        try{
          const projectAssets=await assets();
          if(!projectAssets.some(asset=>asset.id===input.assetId)||dependencies.some(ref=>!projectAssets.some(asset=>asset.id===ref.assetId)))throw Error("The save includes an asset outside this project.");
          const result=await savePackage({assetId:options.initialRef.assetId,expectedBaseRevisionId:base,files,dependencies,message:typeof input.message==="string"?input.message:"Edited in the browser",signal:options.signal,onProgress:message=>options.onStatus(message)});
          if(result.status==="committed")base=result.revisionId;
          options.onSaved(result);
          return{ref:{assetId:result.assetId,revisionId:result.revisionId},status:result.status};
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
