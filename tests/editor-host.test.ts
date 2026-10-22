import test from "node:test";
import assert from "node:assert/strict";
import {createEditorHost} from "../src/studio/editor-host";
import {isTrustedEditorEvent,EDITOR_BRIDGE_PROTOCOL,type EditorMessage} from "../src/studio/editor-bridge";

const initialRef={assetId:"11111111-1111-4111-8111-111111111111",revisionId:"22222222-2222-4222-8222-222222222222"};
const message=(requestId:string,operation:EditorMessage["operation"],payload:unknown):EditorMessage=>({protocol:EDITOR_BRIDGE_PROTOCOL,channel:"frame",requestId,operation,payload});
test("editor boundary requires the exact source window, origin and channel",()=>{
  const source={} as Window;const data=message("read","openAsset",initialRef);
  assert.equal(isTrustedEditorEvent({source,origin:"https://editor.example",data},source,"https://editor.example","frame"),true);
  assert.equal(isTrustedEditorEvent({source:{} as Window,origin:"https://editor.example",data},source,"https://editor.example","frame"),false);
  assert.equal(isTrustedEditorEvent({source,origin:"https://other.example",data},source,"https://editor.example","frame"),false);
  assert.equal(isTrustedEditorEvent({source,origin:"https://editor.example",data},source,"https://editor.example","other"),false);
});
test("save locking starts before asynchronous project authorization; duplicate requests share the original result",async()=>{
  const original=globalThis.fetch;
  const controller=new AbortController();let calls=0;
  globalThis.fetch=async()=>{calls++;return new Promise((_,reject)=>controller.signal.addEventListener("abort",()=>reject(Error("Stopped test transfer")),{once:true}));};
  try{
    const host=createEditorHost({projectId:"project",initialRef,signal:controller.signal,onDirty(){},onStatus(){},onSaved(){}});
    const payload={assetId:initialRef.assetId,expectedBaseRevisionId:initialRef.revisionId,files:[{path:"edit.fcproj",role:"master",file:new Blob(["native"])}],dependencies:[]};
    const first=host.handle(message("one","saveAsset",payload));
    assert.equal(first,host.handle(message("one","saveAsset",payload)));
    await assert.rejects(host.handle(message("two","saveAsset",payload)),/Another save/);
    assert.equal(calls,1);
    const failure=assert.rejects(first,/Stopped/);controller.abort();await failure;
  }finally{globalThis.fetch=original;}
});
test("the editor refuses a revision whose returned asset identity differs",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).includes("/projects/")?{assets:[{id:initialRef.assetId}]}:{ref:{...initialRef,assetId:"33333333-3333-4333-8333-333333333333"},files:[],dependencies:[]}),{headers:{"Content-Type":"application/json"}});
  try{
    const host=createEditorHost({projectId:"project",initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved(){}});
    await assert.rejects(host.handle(message("open","openAsset",initialRef)),/does not belong/);
  }finally{globalThis.fetch=original;}
});
