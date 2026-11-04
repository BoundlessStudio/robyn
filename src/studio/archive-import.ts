import {validatePackagePath} from "./assets";
import {BRIDGE_MAX_BYTES, validateBridgePaths} from "./asset-bridge";
import {assertUploadAllowed} from "./upload-policy";
import type {LocalPackageFile} from "./transfer-client";

const invalid = () => Error("Choose a complete ZIP archive using stored or deflated files. Encrypted, split and ZIP64 archives are not supported.");
const crcTable = Array.from({length:256},(_,value) => {
  for (let bit=0;bit<8;bit++) value=value&1?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
interface Entry {path:string;name:Uint8Array;bytes:number;compressed:number;offset:number;method:number;flags:number;crc:number;directory:boolean}

/** Read the bounded central directory first, then stream each exact entry.
 * No archive paths are ever materialized on the application server. */
export async function extractBridgeZip(archive: Blob, options: {signal?:AbortSignal;onProgress?:(message:string)=>void} = {}): Promise<LocalPackageFile[]> {
  const {signal,onProgress}=options;
  signal?.throwIfAborted();
  if (archive.size<22 || archive.size>BRIDGE_MAX_BYTES) throw invalid();
  const tailStart=Math.max(0,archive.size-65557),tail=new Uint8Array(await archive.slice(tailStart).arrayBuffer()),end=new DataView(tail.buffer);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--) if(end.getUint32(i,true)===0x06054b50 && i+22+end.getUint16(i+20,true)===tail.length){eocd=i;break;}
  if(eocd<0)throw invalid();
  const count=end.getUint16(eocd+10,true),size=end.getUint32(eocd+12,true),start=end.getUint32(eocd+16,true);
  if(end.getUint16(eocd+4,true)||end.getUint16(eocd+6,true)||end.getUint16(eocd+8,true)!==count||!count||count>2048||size>4*1024**2||start+size!==tailStart+eocd)throw invalid();
  const central=new Uint8Array(await archive.slice(start,start+size).arrayBuffer()),view=new DataView(central.buffer),entries:Entry[]=[],allPaths=new Set<string>();
  let pos=0;
  for(let i=0;i<count;i++){
    signal?.throwIfAborted();
    if(pos+46>size||view.getUint32(pos,true)!==0x02014b50)throw invalid();
    const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),compressed=view.getUint32(pos+20,true),bytes=view.getUint32(pos+24,true);
    const nameLength=view.getUint16(pos+28,true),extraLength=view.getUint16(pos+30,true),commentLength=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
    if(!nameLength||pos+46+nameLength+extraLength+commentLength>size||flags&~0x080e||![0,8].includes(method)||view.getUint16(pos+34,true)||[bytes,compressed,offset].includes(0xffffffff))throw invalid();
    const name=central.slice(pos+46,pos+46+nameLength);
    // Legacy non-ASCII encodings are ambiguous; require a UTF-8 ZIP instead.
    if(!(flags&0x800)&&name.some(byte=>byte>127))throw Error("Save this archive with UTF-8 filenames, then try again.");
    let path:string;
    try{path=new TextDecoder("utf-8",{fatal:true}).decode(name);}catch{throw invalid();}
    const mode=(view.getUint32(pos+38,true)>>>16)&0xf000,directory=path.endsWith("/");
    if(![0,0x8000,0x4000].includes(mode)||mode===0x4000&&!directory||mode===0x8000&&directory)throw Error(`Archives must contain regular files and folders, without symbolic links: ${path}`);
    path=validatePackagePath(directory?path.slice(0,-1):path);
    assertUploadAllowed(path);
    const key=path.toLowerCase();
    if(allPaths.has(key))throw Error(`Two archive entries have the same path: ${path}`);
    allPaths.add(key);
    if(directory&&bytes)throw invalid();
    entries.push({path,name,bytes,compressed,offset,method,flags,crc:view.getUint32(pos+16,true),directory});
    pos+=46+nameLength+extraLength+commentLength;
  }
  if(pos!==size)throw invalid();
  const files=entries.filter(entry=>!entry.directory);
  validateBridgePaths(files);
  const filePaths=new Set(files.map(file=>file.path.toLowerCase()));
  for(const entry of entries)for(let i=1,parts=entry.path.toLowerCase().split("/");i<parts.length;i++)if(filePaths.has(parts.slice(0,i).join("/")))throw Error(`A file and folder have the same path: ${entry.path}`);
  // Validate all local records before decompression, including name agreement
  // and nonoverlapping byte ranges. Never trust just one ZIP header.
  const ranges:Array<{entry:Entry;dataStart:number;end:number}>=[];
  for(const entry of entries){
    signal?.throwIfAborted();
    const local=new Uint8Array(await archive.slice(entry.offset,entry.offset+30+entry.name.length).arrayBuffer()),header=new DataView(local.buffer);
    if(local.length<30+entry.name.length||header.getUint32(0,true)!==0x04034b50||header.getUint16(6,true)!==entry.flags||header.getUint16(8,true)!==entry.method||header.getUint16(26,true)!==entry.name.length||entry.name.some((byte,i)=>local[30+i]!==byte))throw invalid();
    if(!(entry.flags&8)&&(header.getUint32(14,true)!==entry.crc||header.getUint32(18,true)!==entry.compressed||header.getUint32(22,true)!==entry.bytes))throw invalid();
    const dataStart=entry.offset+30+entry.name.length+header.getUint16(28,true),dataEnd=dataStart+entry.compressed;
    if(dataEnd>start)throw invalid();
    ranges.push({entry,dataStart,end:dataEnd});
  }
  ranges.sort((a,b)=>a.entry.offset-b.entry.offset);
  for(let i=1;i<ranges.length;i++)if(ranges[i].entry.offset<ranges[i-1].end)throw invalid();
  const output:LocalPackageFile[]=[];
  for(const {entry,dataStart,end:dataEnd} of ranges){
    signal?.throwIfAborted();
    if(entry.directory)continue;
    onProgress?.(`Extracting ${entry.path}…`);
    let stream=archive.slice(dataStart,dataEnd).stream();
    if(entry.method===8){
      try{stream=stream.pipeThrough(new DecompressionStream("deflate-raw"));}catch{throw Error("This browser cannot extract this ZIP. Extract it locally and choose Upload folder.");}
    }
    const reader=stream.getReader(),abort=()=>{void reader.cancel().catch(()=>{});};
    signal?.addEventListener("abort",abort,{once:true});
    const chunks:BlobPart[]=[];let actual=0,crc=0xffffffff;
    try{
      while(true){
        signal?.throwIfAborted();
        const {done,value}=await reader.read();if(done)break;
        if((actual+=value.length)>entry.bytes){await reader.cancel();throw Error(`The extracted file exceeds its declared size: ${entry.path}`);}
        for(const byte of value)crc=crcTable[(crc^byte)&255]^(crc>>>8);
        chunks.push(value);
      }
      signal?.throwIfAborted();
      if(actual!==entry.bytes||((crc^0xffffffff)>>>0)!==entry.crc)throw Error(`The archive file failed its integrity check: ${entry.path}`);
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
    finally{signal?.removeEventListener("abort",abort);reader.releaseLock();}
    output.push({path:entry.path,role:"dependency",file:new Blob(chunks,{type:"application/octet-stream"})});
  }
  output.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  output[0].role="master";
  return output;
}
