import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {sourceFormat,sourceImportFiles,validateSourcePackage} from "../src/studio/source-import";
import {validateRevisionPackage} from "../src/studio/assets";

test("common files stay reusable sources with exact originals and honest media types",async()=>{
  for(const [name,bytes,kind,mime] of [
    ["Cover.PNG",Buffer.from([137,80,78,71,13,10,26,10,0,128]),"image","image/png"],
    ["Brand.svg",Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="10"/></svg>'),"image","image/svg+xml"],
    ["Music.wav",Buffer.concat([Buffer.from('RIFF'),Buffer.from([255,255,255,255]),Buffer.from('WAVEfmt ')]),"audio","audio/wav"],
    ["Clip.mp4",Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom')]),"video","video/mp4"],
  ] as const){
    const files=await sourceImportFiles(new File([bytes],name,{type:"application/octet-stream"}));
    assert.equal(sourceFormat(name)?.kind,kind);
    assert.equal(files[0].file.type,mime);
    assert.deepEqual(Buffer.from(await files[0].file.arrayBuffer()),bytes);
    assert.equal(files.length,kind==="image"?2:1);
    const pkg=validateRevisionPackage({files:await Promise.all(files.map(async f=>({path:f.path,role:f.role,mimeType:f.file.type,bytes:f.file.size,sha256:createHash('sha256').update(Buffer.from(await f.file.arrayBuffer())).digest('hex')}))),dependencies:[],message:"Imported original"});
    assert.equal(validateSourcePackage(pkg),kind);
    assert.throws(()=>validateSourcePackage({...pkg,files:pkg.files.map(f=>({...f,mimeType:"text/html"}))}),/supported/);
    if(pkg.files.length>1)assert.throws(()=>validateSourcePackage({...pkg,files:pkg.files.map((f,i)=>i?{...f,sha256:"f".repeat(64)}:f)}),/preserve/);
  }
  for(const name of ["file.psd","file.pptx","file.docx","file.exe","file.html"])assert.equal(sourceFormat(name),null);
  await assert.rejects(sourceImportFiles(new File(['not PNG'],'fake.png')),/contents do not match/);
  await assert.rejects(sourceImportFiles(new File(['<!DOCTYPE svg><svg/>'],'external.svg')),/standalone SVG/);
});
