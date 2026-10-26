import test from "node:test";
import assert from "node:assert/strict";
import {validateRevisionPackage} from "../src/studio/assets";
test("new pilot packages fail before upload when native work cannot fit the supported working-set limits",()=>{
  const master={path:"work.native",role:"master",mimeType:"application/octet-stream",bytes:512*1024**2,sha256:"a".repeat(64)};
  assert.equal(validateRevisionPackage({files:[master],dependencies:[]}).files[0].bytes,master.bytes);
  assert.throws(()=>validateRevisionPackage({files:[{...master,bytes:master.bytes+1}],dependencies:[]}),/512 MiB/);
  assert.throws(()=>validateRevisionPackage({files:[master,{...master,path:"one.bin",role:"dependency"},{...master,path:"two.bin",role:"dependency"}],dependencies:[]}),/1 GiB/);
});
