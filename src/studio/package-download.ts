import {apiFetch} from "@/lib/api";
import {validatePackagePath,type AssetRef} from "./assets";
import type {OpenAssetResult} from "./editor-bridge";
import {digestFile,type LocalPackageFile} from "./transfer-client";
import {savedFileUrl} from "./saved-file";

/** Renew each exact file through the BFF, then check it before exporting or
 * including it in another revision. Never trust a stale signed download URL. */
export async function downloadSavedPackage(ref:AssetRef,signal?:AbortSignal,onProgress?:(message:string)=>void){
  const pkg=await apiFetch<OpenAssetResult>(`/api/studio/revisions/${ref.revisionId}`,{signal});
  if(pkg.ref.assetId!==ref.assetId||pkg.ref.revisionId!==ref.revisionId)throw Error("The saved revision does not belong to this asset.");
  if(!pkg.files.length||pkg.files.length>200||pkg.files.reduce((sum,file)=>sum+file.bytes,0)>1024**3)throw Error("This package exceeds the 1 GiB download limit.");
  const files:LocalPackageFile[]=[];
  for(const file of pkg.files){
    signal?.throwIfAborted();validatePackagePath(file.path);
    if(!["master","preview","export","dependency"].includes(file.role))throw Error("Invalid saved file role.");
    onProgress?.(`Preparing ${file.path}…`);
    const response=await fetch(savedFileUrl(ref.revisionId,file.path),{signal});
    if(!response.ok)throw Error("A saved file could not be downloaded. Try again.");
    if(!response.body)throw Error("A saved file could not be downloaded. Try again.");
    const reader=response.body.getReader(),parts:BlobPart[]=[];let bytes=0;
    while(true){
      const {value,done}=await reader.read();if(done)break;
      if((bytes+=value.byteLength)>file.bytes){await reader.cancel();throw Error("A saved file failed its integrity check. Nothing has been exported or saved.");}
      parts.push(value);
    }
    const blob=new Blob(parts);
    if(blob.size!==file.bytes||await digestFile(blob,signal)!==file.sha256)throw Error("A saved file failed its integrity check. Nothing has been exported or saved.");
    files.push({path:file.path,role:file.role as LocalPackageFile["role"],file:blob.slice(0,blob.size,file.mimeType)});
  }
  return {files,dependencies:pkg.dependencies};
}

const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
async function crc32(blob:Blob,signal?:AbortSignal){
  let crc=0xffffffff;
  for(let offset=0;offset<blob.size;offset+=1024*1024){signal?.throwIfAborted();for(const byte of new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer()))crc=crcTable[(crc^byte)&255]^(crc>>>8);}
  return (crc^0xffffffff)>>>0;
}

/** Uncompressed ZIP keeps the original bytes and relative paths, without
 * another full in-memory copy of large media to compress it. */
export async function packageZip(files:LocalPackageFile[],signal?:AbortSignal):Promise<Blob>{
  if(!files.length||files.length>200||files.reduce((sum,file)=>sum+file.file.size,0)>1024**3)throw Error("Choose a package up to 1 GiB and 200 files.");
  const body:BlobPart[]=[],directory:BlobPart[]=[],paths=new Set<string>();let offset=0,centralSize=0;
  for(const {path,file} of files){
    validatePackagePath(path);
    if(paths.has(path.toLowerCase()))throw Error("Duplicate package path.");paths.add(path.toLowerCase());
    const name=new TextEncoder().encode(path),crc=await crc32(file,signal);
    const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);
    h.setUint32(14,crc,true);h.setUint32(18,file.size,true);h.setUint32(22,file.size,true);h.setUint16(26,name.length,true);header.set(name,30);
    const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);
    c.setUint32(16,crc,true);c.setUint32(20,file.size,true);c.setUint32(24,file.size,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
    body.push(header,file);directory.push(central);offset+=header.length+file.size;centralSize+=central.length;
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
  return new Blob([...body,...directory,end],{type:"application/zip"});
}

export function downloadBlob(blob:Blob,name:string){
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=name.replace(/[\\/:*?"<>|\x00-\x1f]/g,"-");link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
