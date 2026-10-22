import test from "node:test";
import assert from "node:assert/strict";
import { validatePackagePath,validateRevisionPackage } from "../src/studio/assets";
import { isEditorMessage,EDITOR_BRIDGE_PROTOCOL } from "../src/studio/editor-bridge";
test("native package paths remain relative and portable across browser and workstation",()=>{
  for(const path of ["../secret","/secret","a/../b","a\\b","a//b","a/%2e%2e/b","c:secret","CON.txt","asset. ","a\u0000b","a/NUL","a/com1.txt"])assert.throws(()=>validatePackagePath(path));
  assert.equal(validatePackagePath("media/portrait edit 01.png"),"media/portrait edit 01.png");
  const file={path:"master.native",role:"master",bytes:42,mimeType:"application/octet-stream",sha256:"a".repeat(64)};
  const pkg={files:[file],dependencies:[],message:"Native save"};
  assert.equal(validateRevisionPackage(pkg).files.length,1);
  assert.throws(()=>validateRevisionPackage({...pkg,files:[file,{...file,path:"MASTER.native",role:"dependency"}]}),/unique/);
  assert.throws(()=>validateRevisionPackage({...pkg,files:[{...file,role:"preview"}]}),/native master/);
  assert.throws(()=>validateRevisionPackage({...pkg,dependencies:[{assetId:"latest",revisionId:"latest"}]}),/Invalid/);
});
test("editor messages require the per-frame channel and a known operation",()=>{
  const message={protocol:EDITOR_BRIDGE_PROTOCOL,channel:"frame-a",requestId:"save-1",operation:"saveAsset",payload:{}};
  assert.equal(isEditorMessage(message,"frame-a"),true);
  assert.equal(isEditorMessage(message,"frame-b"),false);
  assert.equal(isEditorMessage({...message,operation:"exec"},"frame-a"),false);
  assert.equal(isEditorMessage({...message,requestId:""},"frame-a"),false);
});
