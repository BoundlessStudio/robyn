"use client";

import {useRef,useState} from "react";
import type {AssetRef} from "@/studio/assets";
import {validatePackagePath} from "@/studio/assets";
import {downloadSavedPackage} from "@/studio/package-download";
import {describeLocalPackage,digestFile,savePackage,type LocalPackageFile,type SaveResult} from "@/studio/transfer-client";
import {sourceFormat} from "@/studio/source-import";
import {StudioDialog} from "./StudioDialog";

export function AddExportsDialog({assetRef,name,close,saved}:{assetRef:AssetRef;name:string;close:()=>void;saved:(result:SaveResult)=>Promise<void>}){
  const [files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
  const controller=useRef<AbortController|null>(null),prepared=useRef<{files:LocalPackageFile[];dependencies:AssetRef[]}|null>(null);
  async function save(){
    if(busy||!files.length)return;setBusy(true);setError("");setLocked(true);
    controller.current=new AbortController();const signal=controller.current.signal;
    try{
      if(!prepared.current){
        if(files.length>20||files.some(file=>!file.size||file.size>256*1024**2))throw Error("Choose up to 20 exports, each between 1 byte and 256 MiB.");
        for(const file of files)validatePackagePath(file.name);
        const pkg=await downloadSavedPackage(assetRef,signal,setStatus);
        for(const file of files){
          const hash=await digestFile(file,signal),path=`exports/${hash.slice(0,16)}-${file.name}`;
          if(pkg.files.some(existing=>existing.path.toLowerCase()===path.toLowerCase()))continue;
          const extraTypes:Record<string,string>={pdf:"application/pdf",csv:"text/csv",tsv:"text/tab-separated-values",txt:"text/plain",mid:"audio/midi",midi:"audio/midi",dxf:"image/vnd.dxf",stl:"model/stl",obj:"model/obj",glb:"model/gltf-binary"};
          const type=sourceFormat(file.name)?.mimeType??extraTypes[file.name.split(".").pop()!.toLowerCase()]??file.type??"application/octet-stream";
          pkg.files.push({path,role:"export",file:file.slice(0,file.size,type||"application/octet-stream")});
        }
        await describeLocalPackage({...pkg,message:"Added exports for sharing",signal,onProgress:setStatus});
        prepared.current=pkg;
      }
      const result=await savePackage({assetId:assetRef.assetId,expectedBaseRevisionId:assetRef.revisionId,...prepared.current,message:"Added exports for sharing",signal,onProgress:setStatus});
      await saved(result);
    }catch(reason){setError(signal.aborted?"Upload paused. Continue to finish adding these exports.":(reason as Error).message);if(!prepared.current)setLocked(false);}
    finally{setBusy(false);}
  }
  return <StudioDialog title="Add exports." eyebrow={name} close={close} busy={busy}>
    <p className="studio-muted">Export from your Craft, then choose those files here. They’ll be saved beside this native document in a new revision and become available to compatible Crafts.</p>
    <p className="studio-muted">Use exports of this saved version. Save any newer editor changes before adding exports.</p>
    <label>Export files<input type="file" multiple disabled={locked||busy} onChange={event=>setFiles(Array.from(event.target.files??[]))}/></label>
    {files.length>0&&<p className="studio-muted">{files.map(file=>file.name).join(", ")}</p>}
    {error&&<p className="studio-error" role="alert">{error}</p>}
    {busy&&<p role="status">{status}</p>}
    {busy?<button className="studio-button" onClick={()=>controller.current?.abort()}>Pause upload</button>:<button className="studio-button primary" disabled={!files.length} onClick={()=>void save()}>{locked?"Continue upload":"Save exports to library"}</button>}
  </StudioDialog>;
}
