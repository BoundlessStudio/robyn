import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {packageZip,downloadSavedPackage} from "../src/studio/package-download";

test("complete package downloads keep Unicode paths and exact binary files in a standard ZIP",async()=>{
  const folder=await mkdtemp(join(tmpdir(),'robyn-zip-'));
  try{
    const zip=await packageZip([{path:'My film.fcproj',role:'master',file:new Blob(['native'])},{path:'media/café.wav',role:'dependency',file:new Blob([new Uint8Array([0,255,128,1])])}]);
    const path=join(folder,'package.zip');await writeFile(path,new Uint8Array(await zip.arrayBuffer()));
    execFileSync(process.env.PYTHON??'python',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.namelist()==["My film.fcproj","media/café.wav"]; assert z.testzip() is None; assert z.read("My film.fcproj")==b"native"; assert z.read("media/café.wav")==bytes([0,255,128,1])',path],{windowsHide:true});
    await assert.rejects(packageZip([{path:'../outside',role:'master',file:new Blob(['bad'])}]),/relative/);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test("package exports renew exact BFF URLs and reject wrong revisions or changed bytes",async()=>{
  const original=globalThis.fetch,ref={assetId:'asset',revisionId:'revision'},bytes=Buffer.from('original'),calls:string[]=[];
  const pkg={ref,dependencies:[],files:[{path:'native.fcproj',role:'master',mimeType:'application/json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),downloadUrl:'https://expired.invalid/secret'}]};
  globalThis.fetch=async url=>{calls.push(String(url));return String(url).includes('/file?')?new Response(bytes):Response.json(pkg);};
  try{
    const result=await downloadSavedPackage(ref);assert.equal(await result.files[0].file.text(),'original');
    assert.equal(calls[1],'/api/studio/revisions/revision/file?path=native.fcproj');
    await assert.rejects(downloadSavedPackage({...ref,assetId:'foreign'}),/does not belong/);
    globalThis.fetch=async url=>String(url).includes('/file?')?new Response('corrupt!'):Response.json(pkg);
    await assert.rejects(downloadSavedPackage(ref),/integrity/);
  }finally{globalThis.fetch=original;}
});
