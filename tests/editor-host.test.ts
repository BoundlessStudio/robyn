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

test("employee handoff requires a clean exact revision and preserves its request identity",async()=>{
  const original=globalThis.fetch, requests:Record<string,unknown>[]=[];
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes("/projects/"))return Response.json({assets:[{id:initialRef.assetId,app_id:"filmcraft"}]});
    assert.equal(String(url),"/api/studio/assignments");
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({assignmentId:"33333333-3333-4333-8333-333333333333"});
  };
  try{
    const host=createEditorHost({projectId:"project",initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved(){}});
    const requestId="44444444-4444-4444-8444-444444444444",payload={ref:initialRef,instruction:"Preserve my edit; change the title.",requestId};
    await host.handle(message("dirty","notifyChanges",{assetId:initialRef.assetId,dirty:true}));
    await assert.rejects(host.handle(message("unsaved","requestAgentEdit",payload)),/Save your edits/);
    await host.handle(message("clean","notifyChanges",{assetId:initialRef.assetId,dirty:false}));
    await assert.rejects(host.handle(message("wrong-ref","requestAgentEdit",{...payload,ref:{...initialRef,revisionId:requestId}})),/exact saved revision/);
    const sent=host.handle(message("handoff","requestAgentEdit",payload));
    assert.equal(host.handle(message("handoff","requestAgentEdit",payload)),sent);
    await sent;
    assert.deepEqual(requests,[{projectId:"project",appId:"filmcraft",brief:payload.instruction,inputs:[initialRef],requestId}]);
  }finally{globalThis.fetch=original;}
});

test("employee handoff rechecks changes received during asynchronous authorization",async()=>{
  const original=globalThis.fetch;let authorize!:(response:Response)=>void,posts=0;
  globalThis.fetch=async(url)=>{
    if(String(url).includes("/projects/"))return new Promise<Response>(resolve=>{authorize=resolve;});
    posts++;return Response.json({assignmentId:"33333333-3333-4333-8333-333333333333"});
  };
  try{
    const host=createEditorHost({projectId:"project",initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved(){}});
    const sent=host.handle(message("44444444-4444-4444-8444-444444444444","requestAgentEdit",{ref:initialRef,instruction:"Preserve the saved artwork."}));
    await host.handle(message("changed","notifyChanges",{assetId:initialRef.assetId,dirty:true}));
    authorize(Response.json({assets:[{id:initialRef.assetId,app_id:"vectorcraft"}]}));
    await assert.rejects(sent,/Save your edits/);assert.equal(posts,0);
  }finally{globalThis.fetch=original;}
});

test("Copy retains the bound asset; Save As adopts the committed asset without reopening the editor",async()=>{
  const original=globalThis.fetch;
  const copied="33333333-3333-4333-8333-333333333333",adopted="44444444-4444-4444-8444-444444444444";
  const assets=[{id:initialRef.assetId,app_id:"filmcraft"}], revisions=new Map<string,{assetId:string;base:string|null;dependencies:unknown[]}>();
  const results:unknown[]=[];let index=0;
  globalThis.fetch=async(url,options)=>{
    const path=String(url),body=options?.body?JSON.parse(String(options.body)):{};
    let output:unknown;
    if(path.includes("/projects/"))output={assets};
    else if(path==="/api/studio/assets") {assets.push({id:body.creationId,app_id:body.appId});output={asset:assets.at(-1)};}
    else if(path.endsWith("/revisions")&&options?.method==="POST"){
      const revisionId=`55555555-5555-4555-8555-${String(++index).padStart(12,"0")}`;
      revisions.set(revisionId,{assetId:path.split("/")[4],base:body.expectedBaseRevisionId,dependencies:body.package.dependencies});output={revisionId};
    }else if(path.endsWith("/transfers"))output={transfers:[]};
    else if(path.endsWith("/commit")){const revisionId=path.split("/")[4];output={assetId:revisions.get(revisionId)!.assetId,revisionId,status:"committed"};}
    else throw Error(`Unexpected test route ${path}`);
    return new Response(JSON.stringify(output),{headers:{"Content-Type":"application/json"}});
  };
  try{
    const host=createEditorHost({projectId:"project",initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved:result=>results.push(result)});
    const payload={assetId:initialRef.assetId,expectedBaseRevisionId:initialRef.revisionId,files:[{path:"edit.fcproj",role:"master",file:new Blob(["native"])}],dependencies:[]};
    await host.handle(message("copy","saveAsset",{...payload,mode:"copy",creationId:copied,name:"A copy"}));
    await host.handle(message("original-notify","notifyChanges",{assetId:initialRef.assetId,dirty:true}));
    const saved=await host.handle(message("save-as","saveAsset",{...payload,mode:"saveAs",creationId:adopted,name:"Another direction"})) as {ref:typeof initialRef};
    await host.handle(message("adopted-notify","notifyChanges",{assetId:adopted,dirty:false}));
    await assert.rejects(host.handle(message("old","saveAsset",payload)),/exact revision/);
    await host.handle(message("continued","saveAsset",{...payload,assetId:adopted,expectedBaseRevisionId:saved.ref.revisionId}));
    assert.deepEqual([...revisions.values()].map(row=>[row.assetId,row.base]),[[copied,null],[adopted,null],[adopted,saved.ref.revisionId]]);
    assert.deepEqual([...revisions.values()][0].dependencies,[initialRef]);
    assert.deepEqual([...revisions.values()][2].dependencies,[initialRef],"later saves retain the source revision added by Save As");
    assert.equal(results.length,3);
  }finally{globalThis.fetch=original;}
});
