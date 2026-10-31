import { apiFetch } from "@/lib/api";
import { requireUuid, validatePackagePath, type AssetRef, type AssetSummary, type PackageFileRole } from "./assets";
import { digestFile, savePackage, type SaveResult, type LocalPackageFile } from "./transfer-client";
import {sourceFormat,sourceImportFiles} from "./source-import";
import {nativeImportApp,checkNativeImport,importedDocumentName} from "./native-import";
import type { EditorMessage, EditorSaveMode, OpenAssetResult } from "./editor-bridge";

export interface EditorSaveResult extends SaveResult { mode: EditorSaveMode }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid editor request.");
  return value as Record<string, unknown>;
}
function assetRef(value:unknown):AssetRef {const input=object(value);return{assetId:requireUuid(input.assetId),revisionId:requireUuid(input.revisionId)};}

export function createEditorHost(options:{projectId:string;initialRef:AssetRef;signal:AbortSignal;onDirty:(dirty:boolean)=>void;onStatus:(message:string)=>void;onSaved:(result:EditorSaveResult)=>void;onImported?:()=>void}) {
  let assetId=options.initialRef.assetId;
  let base=options.initialRef.revisionId;
  // Save As adds the source here, after the editor froze its dependency list.
  // Carry that provenance into subsequent saves without requiring every adapter
  // to learn about a dependency introduced by the host.
  let adoptedDependencies:AssetRef[]=[];
  let saving=false;
  let dirty=false;
  let importing=false;
  let activating=false;
  // A multi-document native editor may return to its original document after
  // Save As. Only this editor's initial and durably adopted bindings can resume;
  // opening an input/reference file does not grant it a writable binding.
  const bindings=new Map([[assetId,base]]);
  const imports=new Map<string,{fingerprint:string;result?:{ref:AssetRef;status:"committed"}}>();
  const requests=new Map<string,{operation:string;result:Promise<unknown>;settled:boolean}>();
  async function assets(previews=false) {
    const endpoint=previews?`/api/studio/assets?projectId=${encodeURIComponent(options.projectId)}`:`/api/studio/projects/${options.projectId}`;
    const data=await apiFetch<{assets:AssetSummary[];nextCursor?:string|null;nextAssetCursor?:string|null}>(endpoint,{signal:options.signal});
    const rows=new Map(data.assets.map(asset=>[asset.id,asset]));
    let cursor=previews?data.nextCursor:data.nextAssetCursor;
    const seen=new Set<string>();
    while(cursor){
      if(seen.has(cursor))throw Error("The project asset list could not finish loading. Try again.");
      seen.add(cursor);
      const page=await apiFetch<{assets:AssetSummary[];nextCursor?:string|null}>(`/api/studio/assets?projectId=${encodeURIComponent(options.projectId)}&cursor=${encodeURIComponent(cursor)}`,{signal:options.signal});
      for(const asset of page.assets)rows.set(asset.id,asset);
      cursor=page.nextCursor;
    }
    return [...rows.values()];
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
      case "activateAsset": {
        const ref=assetRef(message.payload);
        if(saving||importing||activating)throw Error("Another library operation is still being confirmed.");
        if(bindings.get(ref.assetId)!==ref.revisionId)throw Error("Resume only an exact document already bound by this editor.");
        activating=true;
        try{
          const pkg=await open(ref);
          options.signal.throwIfAborted();
          assetId=ref.assetId;base=ref.revisionId;
          adoptedDependencies=pkg.dependencies.map(value=>({...value}));
          return {ref};
        }finally{activating=false;}
      }
      case "importAsset": {
        const input=object(message.payload),creationId=requireUuid(input.creationId,"import request ID");
        const name=validatePackagePath(input.name);
        if(name.includes("/")||!(input.file instanceof Blob)||!input.file.size||input.file.size>256*1024**2)throw Error("Choose a single supported file up to 256 MiB.");
        if(importing||activating)throw Error("Another library import is still being confirmed.");
        importing=true;
        try{
          const file=new File([input.file],name,{type:input.file.type}),format=sourceFormat(name),app=nativeImportApp(name);
          if(!format&&!app)throw Error("Choose a supported image, audio, video or native document.");
          const fingerprint=JSON.stringify([name,file.type,await digestFile(file,options.signal)]),prior=imports.get(creationId);
          if(prior&&prior.fingerprint!==fingerprint)throw Error("This import request already belongs to different files.");
          if(prior?.result)return prior.result;
          if(!prior&&imports.size>=100)throw Error("Reopen the saved editor before importing more files.");
          const attempt=prior??{fingerprint};imports.set(creationId,attempt);
          const files=format?await sourceImportFiles(file):await checkNativeImport(app!.id,[{path:name,role:"master" as const,file}]);
          const title=importedDocumentName(name);
          if(!format){
            const created=await apiFetch<{asset:AssetSummary}>("/api/studio/assets",{method:"POST",body:JSON.stringify({creationId,projectId:options.projectId,appId:app!.id,name:title}),signal:options.signal});
            if(created.asset.id!==creationId)throw Error("The import could not be confirmed. Retry this import.");
          }
          const result=await savePackage({assetId:creationId,expectedBaseRevisionId:null,files,dependencies:[],message:"Imported from a Craft",...(format?{sourceImport:{projectId:options.projectId,name:title}}:{}),signal:options.signal});
          if(result.status!=="committed")throw Error("This import has a preserved conflict. Open it in Assets before continuing.");
          attempt.result={ref:{assetId:result.assetId,revisionId:result.revisionId},status:result.status};
          options.onImported?.();
          return attempt.result;
        }finally{importing=false;}
      }
      // Published editor pickers use this legacy field solely for their label
      // and skip null values. Give source media its kind label on the bridge;
      // canonical API/database assets still have app_id=null and no owning Craft.
      case "listProjectAssets": return (await assets(true)).map(asset=>asset.app_id ? asset : {...asset,app_id:asset.asset_kind??"media"});
      case "notifyChanges": {
        const input=object(message.payload);
        if(input.assetId!==assetId||typeof input.dirty!=="boolean")throw Error("Invalid change notification.");
        dirty=input.dirty;options.onDirty(dirty);return{received:true};
      }
      case "requestAgentEdit": {
        const input=object(message.payload),ref=assetRef(input.ref);
        if(saving||dirty||activating)throw Error("Save your edits before handing this revision to an employee.");
        if(ref.assetId!==assetId||ref.revisionId!==base)throw Error("Hand off the exact saved revision open in this editor.");
        const instruction=typeof input.instruction==="string"?input.instruction.trim():"";
        if(!instruction||instruction.length>20000)throw Error("Describe the changes using 1–20,000 characters.");
        const requestId=requireUuid(input.requestId??message.requestId,"assignment request ID");
        const current=(await assets()).find(asset=>asset.id===assetId);
        if(!current)throw Error("This asset is outside the open project.");
        // Native changes or another save can arrive while membership is checked.
        // Authorize the still-current, clean revision immediately before dispatch.
        if(saving||dirty||activating)throw Error("Save your edits before handing this revision to an employee.");
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
        if(saving||activating)throw Error("Another save is still being confirmed.");
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
            bindings.set(assetId,base);
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
        // Browsing must not evict the most recent save receipt: an editor may
        // still need it to recover a lost Save As acknowledgement.
        const settled=[...requests.entries()].filter(([,request])=>request.settled);
        const oldest=settled.find(([,request])=>request.operation!=="saveAsset")??settled[0];
        if(!oldest)return Promise.reject(Error("Too many active editor requests."));
        requests.delete(oldest[0]);
      }
      const result=dispatch(message);const request={operation:message.operation,result,settled:false};
      requests.set(message.requestId,request);
      void result.then(()=>{request.settled=true;},()=>{
        request.settled=true;
        // Confirmed saves retain their original receipt across a lost bridge
        // reply. A failed transfer may re-enter savePackage, which reconciles
        // its immutable upload/revision before another commit attempt.
        if(message.operation==="saveAsset"&&requests.get(message.requestId)===request)requests.delete(message.requestId);
      });
      return result;
    },
  };
}
