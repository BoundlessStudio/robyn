"use client";

import {useEffect,useRef,useState} from "react";
import {bridgeFiles,validateBridgePackage} from "@/studio/asset-bridge";
import {extractBridgeZip} from "@/studio/archive-import";
import {BLOCKED_UPLOAD_EXTENSIONS} from "@/studio/upload-policy";
import {describeLocalPackage,digestFile,savePackage,type LocalPackageFile,type SaveResult} from "@/studio/transfer-client";
import {StudioDialog} from "./StudioDialog";

export function AssetBridgeDialog({projectId,close,saved,returnFocusRef}:{projectId:string;close:()=>void;saved:(result:SaveResult)=>Promise<void>;returnFocusRef:React.RefObject<HTMLElement|null>}) {
  const [files,setFiles]=useState<LocalPackageFile[]>([]),[name,setName]=useState("");
  const [busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[error,setError]=useState("");
  const [status,setStatus]=useState(""),[progress,setProgress]=useState(0);
  const filePicker=useRef<HTMLInputElement>(null),folderPicker=useRef<HTMLInputElement>(null),archivePicker=useRef<HTMLInputElement>(null);
  const controller=useRef<AbortController|null>(null),running=useRef(false),pending=useRef<{id:string;name:string;key:string}|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);

  async function choose(selected:File[],mode:"files"|"folder"|"archive") {
    if(!selected.length||running.current||pending.current)return;
    running.current=true;controller.current=new AbortController();setBusy(true);setError("");setFiles([]);setProgress(0);setStatus("Checking your selection…");
    try{
      if(mode==="archive"&&(selected.length!==1||!selected[0].name.toLowerCase().endsWith(".zip")))throw Error("Choose one ZIP archive (.zip).");
      const prepared=mode==="archive"?await extractBridgeZip(selected[0],{signal:controller.current.signal,onProgress:setStatus}):bridgeFiles(selected,mode==="folder");
      controller.current.signal.throwIfAborted();
      setFiles(prepared);setName((mode==="folder"?selected[0].webkitRelativePath.split("/")[0]:mode==="archive"?selected[0].name.replace(/\.zip$/i,""):selected.length===1?selected[0].name:"Uploaded files").slice(0,160));
      setStatus("");
    }catch(reason){setError(controller.current.signal.aborted?"Selection paused. Choose your files again.":(reason as Error).message);setStatus("");}
    finally{running.current=false;setBusy(false);}
  }

  async function upload() {
    if(running.current||!files.length||!name.trim())return;
    running.current=true;controller.current=new AbortController();const signal=controller.current.signal;
    setBusy(true);setError("");setProgress(0);
    try{
      const bridgeImport={projectId,name:pending.current?.name??name.trim()},message="Uploaded with Asset Bridge";
      if(!pending.current){
        const pkg=validateBridgePackage(await describeLocalPackage({files,dependencies:[],message,bridgeImport,signal,onProgress:setStatusProgress}));
        const key=`robyn-bridge:${await digestFile(new Blob([JSON.stringify({projectId,name:bridgeImport.name,pkg})]),signal)}`;
        let id=crypto.randomUUID();
        try{const previous=localStorage.getItem(key);if(previous&&/^[0-9a-f-]{36}$/.test(previous))id=previous as typeof id;localStorage.setItem(key,id);}catch{/* Resume within this dialog if browser storage is disabled. */}
        pending.current={id,name:bridgeImport.name,key};setLocked(true);
      }
      const result=await savePackage({assetId:pending.current.id,expectedBaseRevisionId:null,files,dependencies:[],message,bridgeImport,signal,onProgress:setStatusProgress});
      if(result.status!=="committed")throw Error("The upload was preserved as a conflict. Open its saved revision in Assets.");
      // Retain the creation identity until the library has acknowledged refresh.
      await saved(result);
      try{localStorage.removeItem(pending.current.key);}catch{}
    }catch(reason){setError(signal.aborted?"Upload paused. Continue this upload, or select the same files later to resume.":(reason as Error).message);}
    finally{running.current=false;setBusy(false);}
  }
  function setStatusProgress(message:string,percent:number){setStatus(message);setProgress(percent);}
  function select(event:React.ChangeEvent<HTMLInputElement>,mode:"files"|"folder"|"archive") {const selected=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";void choose(selected,mode);}
  const total=files.reduce((sum,file)=>sum+file.file.size,0);
  return <StudioDialog title="Bring your files into Robyn." eyebrow="ASSET BRIDGE" close={close} busy={busy} returnFocusRef={returnFocusRef}><div className="studio-form">
    <p className="studio-muted">Upload files, a complete folder, or extract a ZIP into your private project library. Relative paths stay together, ready for you and Robyn to download and use. Uploads are saved copies; local changes need another upload.</p>
    {!locked&&<>
      <input ref={filePicker} type="file" multiple hidden aria-label="Bridge files" onChange={event=>select(event,"files")}/>
      <input ref={folderPicker} type="file" multiple hidden {...{webkitdirectory:""}} aria-label="Bridge folder" onChange={event=>select(event,"folder")}/>
      <input ref={archivePicker} type="file" accept=".zip,application/zip" hidden aria-label="Bridge archive" onChange={event=>select(event,"archive")}/>
      <div className="studio-action-row"><button className="studio-button" disabled={busy} onClick={()=>filePicker.current?.click()}>Choose files</button><button className="studio-button" disabled={busy} onClick={()=>folderPicker.current?.click()}>Choose folder</button><button className="studio-button" disabled={busy} onClick={()=>archivePicker.current?.click()}>Upload archive</button></div>
    </>}
    <p className="studio-muted">Up to 200 files, 512 MiB per file and 1 GiB in total after extraction. ZIP selection is extracted once; nested archives stay as files. Empty files are included; empty folders have no files to upload.</p>
    <details><summary>Blocked file types</summary><p>Executable binaries and installers are blocked, including inside archives. Scripts and current Craft formats remain supported.</p><p className="studio-muted">{BLOCKED_UPLOAD_EXTENSIONS.join(", ")}, versioned .so libraries</p></details>
    {files.length>0&&<><label>Upload name<input aria-label="Upload name" value={name} maxLength={160} disabled={busy||locked} onChange={event=>setName(event.target.value)}/></label><p>{files.length} files · {(total/1024**2).toFixed(1)} MiB</p><details><summary>Selected files</summary><ul>{files.map(file=><li key={file.path}>{file.path}</li>)}</ul></details></>}
    {busy&&<div className="studio-upload-progress" role="status"><progress aria-label="Bridge upload progress" value={progress} max={100}/><p>{status}</p></div>}
    {error&&<p role="alert" className="studio-error">{error}</p>}
    <div className="studio-action-row">{busy?<button className="studio-button" onClick={()=>controller.current?.abort()}>Pause upload</button>:files.length>0&&<button className="studio-button primary" disabled={!name.trim()} onClick={()=>void upload()}>{locked?"Continue upload":"Upload all files"}</button>}</div>
  </div></StudioDialog>;
}
