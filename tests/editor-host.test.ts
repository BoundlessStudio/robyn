import test from "node:test";
import assert from "node:assert/strict";
import {createEditorHost} from "../src/studio/editor-host";
import {isTrustedEditorEvent,EDITOR_BRIDGE_PROTOCOL,type EditorMessage} from "../src/studio/editor-bridge";

const initialRef={assetId:"11111111-1111-4111-8111-111111111111",revisionId:"22222222-2222-4222-8222-222222222222"};
const message=(requestId:string,operation:EditorMessage["operation"],payload:unknown):EditorMessage=>({protocol:EDITOR_BRIDGE_PROTOCOL,channel:"frame",requestId,operation,payload});

test("editor pickers and project authorization include every page without cursor loops",async()=>{
  const original=globalThis.fetch,requests:string[]=[];
  const old={id:initialRef.assetId,app_id:"filmcraft",current_revision_id:initialRef.revisionId};
  globalThis.fetch=async url=>{
    const path=String(url);requests.push(path);
    if(path.includes('/revisions/'))return Response.json({ref:initialRef,files:[],dependencies:[]});
    if(path.includes('cursor=older'))return Response.json({assets:[old],nextCursor:null});
    return Response.json({assets:[],nextCursor:'older',nextAssetCursor:'older'});
  };
  try{
    const host=createEditorHost({projectId:'project',initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved(){}});
    assert.deepEqual(await host.handle(message('all','listProjectAssets',{})),[old]);
    assert.deepEqual(await host.handle(message('old','openAsset',initialRef)),{ref:initialRef,files:[],dependencies:[]});
    assert.equal(requests.filter(path=>path.includes('cursor=older')).length,2);
    globalThis.fetch=async()=>Response.json({assets:[],nextCursor:'repeat',nextAssetCursor:'repeat'});
    await assert.rejects(host.handle(message('loop','listProjectAssets',{})),/finish loading/);
  }finally{globalThis.fetch=original;}
});

test("Craft imports save an original through the project BFF, preserve editor binding and fence changed retries",async()=>{
  const original=globalThis.fetch,requests:Array<{path:string;body:any}>=[],changes:boolean[]=[];
  const imported='33333333-3333-4333-8333-333333333333',revision='44444444-4444-4444-8444-444444444444';let notices=0;
  globalThis.fetch=async(url,options)=>{
    const path=String(url),body=options?.body?JSON.parse(String(options.body)):{};requests.push({path,body});
    if(path==='/api/studio/sources')return Response.json({revisionId:revision});
    if(path.endsWith('/transfers'))return Response.json({transfers:[]});
    if(path.endsWith('/commit'))return Response.json({assetId:imported,revisionId:revision,status:'committed'});
    throw Error('Unexpected import request');
  };
  try{
    const host=createEditorHost({projectId:'owned-project',initialRef,signal:new AbortController().signal,onDirty:value=>changes.push(value),onStatus(){},onSaved(){assert.fail('Import must not switch the open editor');},onImported(){notices++;}});
    await host.handle(message('dirty','notifyChanges',{assetId:initialRef.assetId,dirty:true}));
    const file=new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']),input={creationId:imported,name:'Source.svg',file};
    const result=await host.handle(message('import','importAsset',input));
    assert.deepEqual(result,{ref:{assetId:imported,revisionId:revision},status:'committed'});
    assert.equal(requests[0].body.projectId,'owned-project');assert.equal(requests[0].body.creationId,imported);
    assert.equal(requests[0].body.package.files[0].role,'master');assert.equal(requests[0].body.package.files[0].mimeType,'image/svg+xml');
    const count=requests.length;
    assert.deepEqual(await host.handle(message('lost-bridge-reply','importAsset',input)),result);
    assert.equal(requests.length,count,'a lost bridge reply reuses the confirmed import without another revision');
    await assert.rejects(host.handle(message('changed','importAsset',{...input,file:new Blob(['<svg>different</svg>'])})),/different files/);
    await assert.rejects(host.handle(message('changed-type','importAsset',{...input,file:new Blob([file],{type:'text/plain'})})),/different files/);
    assert.deepEqual(changes,[true]);assert.equal(notices,1);
    await host.handle(message('still-original','notifyChanges',{assetId:initialRef.assetId,dirty:false}));
    await assert.rejects(host.handle(message('invalid','importAsset',{...input,name:'../escape.svg'})),/relative/);
  }finally{globalThis.fetch=original;}
});

test("published editor pickers can select first-class sources while opening only exact project revisions",async()=>{
  const original=globalThis.fetch;
  const source={id:initialRef.assetId,app_id:null,asset_kind:"image",name:"Source image",current_revision_id:initialRef.revisionId};
  const pkg={ref:initialRef,files:[{path:"original/source.png",role:"master",mimeType:"image/png"}],dependencies:[],provenance:{provider:"commons"}};
  globalThis.fetch=async url=>Response.json(String(url).includes("/revisions/")?pkg:{assets:[source]});
  try{
    const host=createEditorHost({projectId:"project",initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved(){}});
    const listed=await host.handle(message("list","listProjectAssets",{})) as Array<typeof source>;
    assert.equal(listed[0].app_id,"image");assert.equal(listed[0].asset_kind,"image");
    assert.deepEqual(await host.handle(message("insert","insertAsset",initialRef)),pkg);
    await assert.rejects(host.handle(message("foreign","insertAsset",{...initialRef,assetId:"33333333-3333-4333-8333-333333333333"})),/outside the open project/);
    assert.equal(source.app_id,null,"canonical source retains no owning Craft");
  }finally{globalThis.fetch=original;}
});
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

test("native document activation locks asynchronous ownership checks and cannot resume a reference input",async()=>{
  const original=globalThis.fetch;
  let authorize!:(response:Response)=>void;
  const dirty:boolean[]=[];
  globalThis.fetch=async url=>String(url).includes('/revisions/')
    ?Response.json({ref:initialRef,files:[],dependencies:[]})
    :new Promise<Response>(resolve=>{authorize=resolve;});
  try{
    const host=createEditorHost({projectId:'owned-project',initialRef,signal:new AbortController().signal,onDirty:value=>dirty.push(value),onStatus(){},onSaved(){assert.fail('Activation is not a save');}});
    await host.handle(message('keep-unsaved','notifyChanges',{assetId:initialRef.assetId,dirty:true}));
    const pending=host.handle(message('resume','activateAsset',initialRef));
    await assert.rejects(host.handle(message('other-resume','activateAsset',initialRef)),/still being confirmed/);
    await assert.rejects(host.handle(message('save-during-resume','saveAsset',{assetId:initialRef.assetId,expectedBaseRevisionId:initialRef.revisionId})),/Another save/);
    authorize(Response.json({assets:[{id:initialRef.assetId}]}));
    assert.deepEqual(await pending,{ref:initialRef});
    assert.deepEqual(dirty,[true],'activation keeps the aggregate dirty state of all native documents');
    const revoked=host.handle(message('revoked','activateAsset',initialRef));
    authorize(Response.json({assets:[]}));
    await assert.rejects(revoked,/outside the open project/);
    await assert.rejects(host.handle(message('foreign','activateAsset',{assetId:'33333333-3333-4333-8333-333333333333',revisionId:initialRef.revisionId})),/already bound/);
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
    if(path.includes("/projects/")||path.startsWith("/api/studio/assets?"))output={assets};
    else if(path===`/api/studio/revisions/${initialRef.revisionId}`)output={ref:initialRef,files:[],dependencies:[]};
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
    for(let n=0;n<110;n++)await host.handle(message(`browse-${n}`,"listProjectAssets",{}));
    assert.deepEqual(await host.handle(message("save-as","saveAsset",{...payload,mode:"saveAs",creationId:adopted,name:"Another direction"})),saved,"a lost Save As bridge receipt recovers after the host adopted the new asset");
    await host.handle(message("adopted-notify","notifyChanges",{assetId:adopted,dirty:false}));
    await assert.rejects(host.handle(message("old","saveAsset",payload)),/exact revision/);
    await host.handle(message("continued","saveAsset",{...payload,assetId:adopted,expectedBaseRevisionId:saved.ref.revisionId}));
    assert.deepEqual([...revisions.values()].map(row=>[row.assetId,row.base]),[[copied,null],[adopted,null],[adopted,saved.ref.revisionId]]);
    assert.deepEqual([...revisions.values()][0].dependencies,[initialRef]);
    assert.deepEqual([...revisions.values()][2].dependencies,[initialRef],"later saves retain the source revision added by Save As");
    assert.equal(results.length,3);
    await assert.rejects(host.handle(message("unbound-copy","activateAsset",{assetId:copied,revisionId:[...revisions.keys()][0]})),/already bound/);
    await assert.rejects(host.handle(message("stale-adoption","activateAsset",saved.ref)),/already bound/);
    assert.deepEqual(await host.handle(message("resume-original","activateAsset",initialRef)),{ref:initialRef});
    await host.handle(message("resumed-notify","notifyChanges",{assetId:initialRef.assetId,dirty:true}));
    assert.equal(results.length,3,"resuming a native document neither writes nor fabricates a save receipt");
  }finally{globalThis.fetch=original;}
});

test("a failed save request can retry its identity while confirmed receipts stay deduplicated",async()=>{
  const original=globalThis.fetch;let interrupted=true,commits=0,saved=0;
  globalThis.fetch=async(url,options)=>{
    const path=String(url);
    if(path.includes('/projects/')){if(interrupted){interrupted=false;throw Error('project read interrupted');}return Response.json({assets:[{id:initialRef.assetId,app_id:'cadcraft'}]});}
    if(path.endsWith('/revisions')&&options?.method==='POST')return Response.json({revisionId:'33333333-3333-4333-8333-333333333333'});
    if(path.endsWith('/transfers'))return Response.json({transfers:[]});
    if(path.endsWith('/commit')){commits++;return Response.json({assetId:initialRef.assetId,revisionId:'33333333-3333-4333-8333-333333333333',status:'committed'});}
    throw Error('Unexpected save request');
  };
  try{
    const host=createEditorHost({projectId:'project',initialRef,signal:new AbortController().signal,onDirty(){},onStatus(){},onSaved(){saved++;}});
    const request=message('frozen-save','saveAsset',{assetId:initialRef.assetId,expectedBaseRevisionId:initialRef.revisionId,files:[{path:'Drawing.dxf',role:'master',file:new Blob(['native'])}],dependencies:[]});
    await assert.rejects(host.handle(request),/project read interrupted/);
    const committed=await host.handle(request);assert.deepEqual(await host.handle(request),committed);
    assert.equal(commits,1);assert.equal(saved,1);
  }finally{globalThis.fetch=original;}
});
