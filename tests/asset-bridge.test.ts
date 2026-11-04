import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {studioApps} from "../src/studio/apps/registry";
import {bridgeFiles,validateBridgePaths,validateBridgePackage} from "../src/studio/asset-bridge";
import {BLOCKED_UPLOAD_EXTENSIONS,uploadBlockReason} from "../src/studio/upload-policy";
import {extractBridgeZip} from "../src/studio/archive-import";
import {validateRevisionPackage} from "../src/studio/assets";
import {zipFiles} from "./helpers/bridge-zip.mjs";

test("the executable denylist preserves every registered Craft format and numerical scripts",()=>{
  for(const app of studioApps)for(const extension of app.formats.native){
    assert.equal(uploadBlockReason(`Work/Project${extension}`),null,`${app.name}: ${extension}`);
    validateBridgePaths([{path:`Work/Project${extension}`,bytes:1}]);
    assert.equal(validateRevisionPackage({files:[{path:`Work/Project${extension}`,bytes:1,role:"master",mimeType:"application/octet-stream",sha256:"a".repeat(64)}],dependencies:[],message:"Native format compatibility"}).files.length,1);
  }
  for(const extension of [".m",".mat",".sql",".py",".js",".sh",".ps1",".csv",".json",".svg",".pdf",".obj",".tif",".ttf",".zip",".tar.gz",".7z"])
    assert.equal(uploadBlockReason(`Scripts/example${extension}`),null,extension);
  for(const extension of BLOCKED_UPLOAD_EXTENSIONS){
    const path=`folder/SETUP${extension.toUpperCase()}`;
    assert.ok(uploadBlockReason(path),extension);
    assert.throws(()=>validateRevisionPackage({files:[{path,bytes:1,role:"master",mimeType:"application/octet-stream",sha256:"a".repeat(64)}],dependencies:[],message:"Executable"}),/Blocked/);
  }
  for(const path of ["Library.so.1.2","Application.app/Contents/file","nested/installer.ExE"])assert.ok(uploadBlockReason(path));
});

test("folder snapshots preserve all relative paths, binary bytes, scripts and empty files",async()=>{
  const selected=[new File([new Uint8Array([0,255,128])],"data.bin"),new File(["x=1;"],"compute.m"),new File([],"empty.txt")];
  for(let i=0;i<selected.length;i++)Object.defineProperty(selected[i],"webkitRelativePath",{value:["Research/data/data.bin","Research/scripts/compute.m","Research/empty.txt"][i]});
  const files=bridgeFiles(selected,true);
  assert.deepEqual(files.map(file=>file.path),["Research/data/data.bin","Research/empty.txt","Research/scripts/compute.m"]);
  assert.equal(files[0].role,"master");assert.ok(files.slice(1).every(file=>file.role==="dependency"));
  assert.deepEqual(new Uint8Array(await files[0].file.arrayBuffer()),new Uint8Array([0,255,128]));
  const pkg={files:await Promise.all(files.map(async file=>({path:file.path,role:file.role,bytes:file.file.size,mimeType:file.file.type,sha256:createHash("sha256").update(Buffer.from(await file.file.arrayBuffer())).digest("hex")}))),dependencies:[],message:"Uploaded with Asset Bridge"};
  assert.equal(validateBridgePackage(pkg).files[1].bytes,0);
  assert.throws(()=>validateRevisionPackage(pkg),/between 1 byte/,'native intake keeps its existing bounds');
  assert.throws(()=>bridgeFiles([new File(["binary"],"setup.exe")]),/Blocked: setup.exe/);
  assert.throws(()=>validateBridgePackage({...pkg,files:pkg.files.map((file,i)=>i?file:{...file,path:"setup.exe"})}),/Blocked/);
});

test("complete preflight rejects unsafe, colliding and oversized trees without partial intake",()=>{
  for(const paths of [["../escape"],["C:/escape"],["a\\b"],["data/A.txt","data/a.txt"],["file","file/child"],["a%20b"],["CON.txt"]]){
    assert.throws(()=>validateBridgePaths(paths.map(path=>({path,bytes:1}))));
  }
  validateBridgePaths([{path:"archive.zip",bytes:1}]);
  assert.throws(()=>validateBridgePaths(Array.from({length:201},(_,i)=>({path:`file-${i}`,bytes:1}))),/200/);
  assert.throws(()=>validateBridgePaths([{path:"large",bytes:512*1024**2+1}]),/512 MiB/);
  assert.throws(()=>validateBridgePaths(["a","b","c"].map(path=>({path,bytes:512*1024**2}))),/1 GiB/);
});

test("stored and deflated ZIPs preserve UTF-8 names, scripts and zero-byte files",async()=>{
  const bytes=zipFiles([{path:"Folder/"},{path:"Folder/café.mat",bytes:Buffer.from([0,255,128]),method:0},{path:"Folder/compute.m",bytes:"x = 2;"},{path:"Folder/empty.txt",bytes:""}]);
  const files=await extractBridgeZip(new Blob([bytes]));
  assert.deepEqual(files.map(file=>file.path),["Folder/café.mat","Folder/compute.m","Folder/empty.txt"]);
  assert.deepEqual(new Uint8Array(await files[0].file.arrayBuffer()),new Uint8Array([0,255,128]));
  assert.equal(await files[1].file.text(),"x = 2;");assert.equal(files[2].file.size,0);
  const nested=zipFiles([{path:"notes.txt",bytes:"Nested original"}]);
  const nestedFiles=await extractBridgeZip(new Blob([zipFiles([{path:"originals/data.zip",bytes:nested}])]));
  assert.deepEqual(Buffer.from(await nestedFiles[0].file.arrayBuffer()),nested,'nested archives remain original files rather than being silently discarded');
});

test("ZIP extraction rejects executable entries, traversal, symlinks, ambiguity and expansion bombs",async()=>{
  for(const entries of [
    [{path:"folder/Setup.EXE"}],[{path:"App.app/Contents/info"}],
    [{path:"../escape"}],[{path:"/absolute"}],[{path:"a\\b"}],
    [{path:"A.txt"},{path:"a.txt"}],[{path:"file"},{path:"file/child"}],
    [{path:"link",mode:0xa1ff,bytes:"target"}],
    [{path:"encrypted",flags:0x801}],[{path:"unsupported",method:99}],
    [{path:"bomb.txt",bytes:"A".repeat(100000),declaredBytes:1}],
    [{path:"too-large.txt",bytes:"",declaredBytes:512*1024**2+1}],
  ])await assert.rejects(extractBridgeZip(new Blob([zipFiles(entries)])));
  const corrupt=zipFiles([{path:"file.txt",bytes:"Original",method:0}]);corrupt[30+"file.txt".length]^=1;
  await assert.rejects(extractBridgeZip(new Blob([corrupt])),/integrity/);
  const mismatch=zipFiles([{path:"file.txt",bytes:"Original"}]);mismatch[30]="F".charCodeAt(0);
  await assert.rejects(extractBridgeZip(new Blob([mismatch])),/complete ZIP/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(extractBridgeZip(new Blob([zipFiles([{path:"file"}])]),{signal:controller.signal}),error=>error instanceof Error&&error.name==="AbortError");
});
