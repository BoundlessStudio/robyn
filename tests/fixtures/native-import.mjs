import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {studioTools} from '../../src/studio/tools.ts';

export const projectId = '11111111-1111-4111-8111-111111111111';
export const origin = 'http://127.0.0.1:3000';
const root = fileURLToPath(new URL('../../', import.meta.url));
const starters=JSON.parse(await readFile(root+'src/studio/generated/blank-starters.json','utf8'));
const director='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let bundlePromise;

async function bundle() {
  bundlePromise ??= build({
    stdin: {contents: `
      import {StrictMode} from 'react';
      import {createRoot} from 'react-dom/client';
      import {WorkspaceProvider} from './src/components/WorkspaceProvider';
      import {ProjectWorkspace} from './src/components/studio/ProjectWorkspace';
      import {StudioLibrary} from './src/components/studio/StudioLibrary';
      import {LibraryAsset} from './src/components/studio/LibraryAsset';
      import {StudioShell} from './src/components/studio/StudioShell';
      import {StudioApplications} from './src/components/studio/StudioApplications';
      import {StudioSettings} from './src/components/studio/StudioSettings';
      import {StudioEmployees} from './src/components/studio/StudioEmployees';
      import {StudioProjects} from './src/components/studio/StudioProjects';
      import {ResearchBrowser} from './src/components/studio/ResearchBrowser';
      import {LibraryAssetRedirect} from './src/components/studio/LibraryAssetRedirect';
      import {DesktopStudioGate} from './src/components/studio/DesktopStudioGate';
      const params=new URLSearchParams(location.search),parts=location.pathname.split('/'),currentProjectId=parts[3],section=parts[4];
      const selected={initialAssetId:params.get('asset')??undefined,initialRevisionId:params.get('revision')??undefined};
      const content=location.pathname==='/dashboard'?<StudioProjects/>:location.pathname.startsWith('/dashboard/library/')?<LibraryAssetRedirect assetId={parts[3]} revisionId={params.get('revision')??undefined}/>:section==='applications'?<StudioApplications projectId={currentProjectId}/>:section==='settings'?<StudioSettings projectId={currentProjectId}/>:section==='library'?(parts[5]?<LibraryAsset projectId={currentProjectId} assetId={parts[5]} initialRevisionId={params.get('revision')??undefined}/>:<StudioLibrary projectId={currentProjectId}/>):section==='employees'?<StudioEmployees projectId={currentProjectId} {...selected} initialView={params.get('view')??undefined}/>:section==='research'?<ResearchBrowser projectId={currentProjectId}/>:<ProjectWorkspace projectId={currentProjectId??"${projectId}"} {...selected} initialAppId={params.get('app')??undefined} initialLaunchId={params.get('launch')??undefined}/>;
      createRoot(document.getElementById('root')).render(<StrictMode><WorkspaceProvider initialWorkspaces={[]} userEmail="fixture@example.test"><DesktopStudioGate><StudioShell>{content}</StudioShell></DesktopStudioGate></WorkspaceProvider></StrictMode>);
    `, resolveDir:root, sourcefile:'native-import-fixture.tsx', loader:'tsx'},
    jsx:'automatic', bundle:true, write:false, platform:'browser', format:'iife', tsconfig:root+'tsconfig.json',
    define:{'process.env.NODE_ENV':'"development"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"isolated-fixture"','process.env.NEXT_PUBLIC_EDITOR_PREVIEW_URLS':JSON.stringify(process.env.NEXT_PUBLIC_EDITOR_PREVIEW_URLS??'{}')},
    plugins:[{name:'next-link',setup(b){
      b.onResolve({filter:/^@novnc\/novnc$/},()=>({path:'rfb',namespace:'rfb-fixture'}));
      b.onLoad({filter:/.*/,namespace:'rfb-fixture'},()=>({contents:'export default class RFB extends EventTarget {constructor(target){super();this.target=target;target.textContent="Isolated Research browser";queueMicrotask(()=>this.dispatchEvent(new Event("connect")))} focus(){} disconnect(){this.target.textContent="";this.dispatchEvent(new Event("disconnect"))}}',loader:'js'}));
      b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
      b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
      // Like Next, retain the mounted page for a same-path link. This catches
      // local editor state that would otherwise be hidden by a full reload.
      b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='navigation'?'export function usePathname(){return location.pathname} export function useRouter(){return {push:url=>location.assign(url),replace:url=>location.replace(url)}}':`import React from "react";export default function Link({onClick,href,...props}){return React.createElement("a",{...props,href,onClick:event=>{onClick?.(event);if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target==="_blank"||event.currentTarget.hasAttribute("download"))return;const url=new URL(href,location.href);if(url.origin===location.origin&&url.pathname===location.pathname){event.preventDefault();history.pushState(null,"",url);}}})}`,loader:'js',resolveDir:root}));
    }}],
  });
  return (await bundlePromise).outputFiles[0].text;
}

// A transport peer, not a native editor. Native editing is checked separately
// against the published WordCraft bundle; these tests exercise the actual host.
const editor = `<!doctype html><html lang="en"><head><title>Isolated editor peer</title></head><body>
  <label>Document text<textarea id="text"></textarea></label><button id="save">Save document</button><p id="state" role="status">Opening</p>
  <script>
    const params=new URLSearchParams(location.hash.slice(1)), channel=params.get('channel'), parentOrigin=params.get('parentOrigin');
    let ref={assetId:params.get('assetId'),revisionId:params.get('revisionId')}, path, pending=new Map();
    function request(operation,payload){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});parent.postMessage({protocol:'robyn.editor.v1',channel,requestId,operation,payload},parentOrigin);});}
    addEventListener('message',event=>{const message=event.data;if(event.origin!==parentOrigin||message.channel!==channel||message.kind!=='result')return;const task=pending.get(message.requestId);if(task){pending.delete(message.requestId);message.ok?task.resolve(message.result):task.reject(Error(message.error));}});
    request('openAsset',ref).then(async pkg=>{const master=pkg.files.find(file=>file.role==='master');path=master.path;document.getElementById('text').value=await (await fetch(master.downloadUrl)).text();await request('notifyChanges',{assetId:ref.assetId,dirty:false});document.getElementById('state').textContent='Ready';});
    document.getElementById('text').oninput=()=>request('notifyChanges',{assetId:ref.assetId,dirty:true});
    document.getElementById('save').onclick=async()=>{const result=await request('saveAsset',{assetId:ref.assetId,expectedBaseRevisionId:ref.revisionId,files:[{path,role:'master',file:new Blob([document.getElementById('text').value],{type:'application/octet-stream'})}],dependencies:[],message:'Edited transport fixture'});ref=result.ref;await request('notifyChanges',{assetId:ref.assetId,dirty:false});document.getElementById('state').textContent='Saved';};
  </script></body></html>`;

export async function nativeImportFixture(browser, {realEditor=false, viewport={width:1440,height:960}, workspaceOrigin=origin, fileOrigin='https://native-import-files.test', initialPath, archived=false, allowance=5000000}={}) {
  const script=await bundle();
  const css=await readFile(root+'node_modules/tailwindcss/preflight.css','utf8')+'\n'+
    '@font-face{font-family:"Space Grotesk Variable";font-style:normal;font-weight:300 700;src:url(/space.woff2)}@font-face{font-family:"Instrument Serif";font-style:italic;font-weight:400;src:url(/serif.woff2)}\n'+
    await readFile(root+'src/app/dashboard/studio.css','utf8');
  // Only this isolated QA context may reach its temporary loopback TUS server.
  const context=await browser.newContext({viewport,permissions:browser.browserType().name()==='chromium'?['local-network-access']:[]});
  const page=await context.newPage();page.setDefaultTimeout(realEditor?60000:10000);
  const state={assets:new Map(),revisions:new Map(),bytes:new Map(),requests:[],errors:[],assignments:new Map(),allowance,failAllowance:false,failAssignmentReply:false,failStarterDownload:false,failCreationReply:false,failCommitReply:false,holdTransfers:false,releaseTransfers:null};
  // WebKit's interception API omits Blob request bodies. Receive real TUS bytes
  // on loopback for every engine instead of substituting the selected input.
  const transferServer=createServer(async(req,res)=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST,PATCH,HEAD,OPTIONS','access-control-allow-headers':'*','access-control-expose-headers':'Location,Upload-Offset,Upload-Length,Tus-Resumable','tus-resumable':'1.0.0'};
    if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end();}
    const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
    const metadata=Object.fromEntries(String(req.headers['upload-metadata']??'').split(',').map(item=>{const [key,value]=item.trim().split(' ');return[key,Buffer.from(value??'','base64').toString()];}));
    const key=req.method==='POST'?metadata.objectName:decodeURIComponent((req.url??'').slice('/storage/upload/'.length));
    if(!key){res.writeHead(400,headers);return res.end();}
    if(req.method==='HEAD'){res.writeHead(200,{...headers,'upload-offset':String(state.bytes.get(key)?.length??0)});return res.end();}
    const stored=req.method==='PATCH'?Buffer.concat([state.bytes.get(key)??Buffer.alloc(0),bytes]):bytes;
    state.bytes.set(key,stored);
    res.writeHead(req.method==='POST'?201:204,{...headers,location:`${transferOrigin}/storage/upload/${encodeURIComponent(key)}`,'upload-offset':String(stored.length)});res.end();
  });
  await new Promise(resolve=>transferServer.listen(0,'127.0.0.1',resolve));transferServer.unref();
  const transferOrigin=`http://127.0.0.1:${transferServer.address().port}`;
  context.once('close',()=>{transferServer.closeAllConnections();transferServer.close();});
  page.on('pageerror',error=>state.errors.push(error.message));
  context.on('page',opened=>{opened.setDefaultTimeout(10000);opened.on('pageerror',error=>state.errors.push(error.message));});
  const project={id:projectId,name:'First project',brief:'',status:archived?'archived':'active',created_at:'2026-10-26T12:00:00Z',updated_at:'2026-10-26T12:00:00Z'};
  state.project=project;state.projects=new Map([[projectId,project]]);
  const employees=[{id:director,role:'Creative Director',appId:null,ready:true},...studioTools.map(app=>({id:randomUUID(),role:app.employee.role,appId:app.id,ready:true}))];
  const cors={'access-control-allow-origin':'*'};
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    if(url.origin===transferOrigin)return route.continue();
    if(url.hostname==='robyn-artcraft-editors.robyn-artcraft-runtime.workers.dev'){
      if(realEditor)return route.continue();
      return route.fulfill({contentType:'text/html',body:editor});
    }
    if(url.origin===fileOrigin&&url.pathname.startsWith('/stored/')){
      const key=decodeURIComponent(url.pathname.slice('/stored/'.length));
      return route.fulfill({contentType:'application/octet-stream',headers:cors,body:state.bytes.get(key)??Buffer.alloc(0)});
    }
    if(url.origin!==workspaceOrigin)return route.fulfill({status:404,body:'No external fixture requests'});
    if(url.pathname==='/artwork/offscript-bloom.png'||(url.pathname==='/_next/image'&&url.searchParams.get('url')==='/artwork/offscript-bloom.png'))return route.fulfill({contentType:'image/png',body:await readFile(root+'public/artwork/offscript-bloom.png')});
    if(/^\/brand\/apps\/[a-z]+\.webp$/.test(url.pathname))return route.fulfill({contentType:'image/webp',body:await readFile(root+'public'+url.pathname)});
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:script});
    if(url.pathname==='/studio.css')return route.fulfill({contentType:'text/css',body:css});
    if(url.pathname==='/space.woff2')return route.fulfill({contentType:'font/woff2',body:await readFile(root+'node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2')});
    if(url.pathname==='/serif.woff2')return route.fulfill({contentType:'font/woff2',body:await readFile(root+'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2')});
    if(url.pathname.startsWith('/studio/starters/')){
      const file=starters.flatMap(item=>item.files).find(file=>file.url===url.pathname);
      if(!file)return route.fulfill({status:404,body:'Unknown starter'});
      return route.fulfill({contentType:file.mimeType,body:state.failStarterDownload?Buffer.from('Corrupt download'):await readFile(root+'public'+decodeURIComponent(file.url))});
    }
    if(url.pathname.startsWith('/api/')){
      const input=['POST','PATCH'].includes(method)?req.postDataJSON():null;
      state.requests.push({path:url.pathname,search:url.search,method,input});
      if(url.pathname==='/api/studio/projects')return route.fulfill({json:{projects:[...state.projects.values()].filter(row=>row.status==='active'),nextCursor:null}});
      if(url.pathname==='/api/studio/research/browser'){assert.ok(state.projects.has(url.searchParams.get('projectId')));state.researchControl??={control:'agent',controlId:null};if(input?.action==='take')state.researchControl={control:'human',controlId:input.controlId};if(input?.action==='return'){assert.equal(input.controlId,state.researchControl.controlId);state.researchControl={control:'agent',controlId:null};}return route.fulfill({json:{...state.researchControl,...(input?.action==='connect'?{ws:'wss://isolated-research.test'}:{})}});}
      if(url.pathname==='/api/studio/bootstrap')return route.fulfill({json:{employees:employees.map(employee=>({...employee,kind:employee.appId?'specialist':'director',app_id:employee.appId,provision_state:'pending'}))}});
      if(url.pathname.startsWith('/api/studio/projects/')){const selected=state.projects.get(url.pathname.split('/').pop());if(!selected)return route.fulfill({status:404,json:{error:{message:'Project not found.'}}});if(method==='PATCH')Object.assign(selected,input);return route.fulfill({json:{project:selected,assets:[...state.assets.values()].filter(row=>row.project_id===selected.id),activity:[],nextAssetCursor:null}});}
      if(url.pathname==='/api/studio/budgets')return route.fulfill({json:{workspaceId:'22222222-2222-4222-8222-222222222222',employees:employees.map(row=>({...row,name:row.role,monthlyCapMicros:0,provisioned:false,budget:null,usage:null,availableMicros:0,error:null})),configured:false,policy:null,summary:{monthlyLimitMicros:0,spentMicros:0,reservedMicros:0,availableMicros:0},period:'2026-10'}});
      if(url.pathname.startsWith('/api/studio/budgets/'))return route.fulfill(state.failAllowance?{status:503,json:{error:{message:'Unavailable'}}}:{json:{availableMicros:state.allowance,reason:state.allowance?null:'No AI allowance remains.'}});
      if(url.pathname==='/api/studio/assignments'){
        if(method==='POST'){
          assert.ok(state.projects.has(input.projectId));assert.ok(employees.some(employee=>employee.id===input.employeeId));
          const prior=state.assignments.get(input.requestId);if(prior)assert.deepEqual(prior.input,input);
          else state.assignments.set(input.requestId,{input,id:randomUUID(),employeeId:input.employeeId,appId:employees.find(employee=>employee.id===input.employeeId).appId,role:employees.find(employee=>employee.id===input.employeeId).role,brief:input.brief,startMode:input.startMode,state:'queued',result:null,deliverables:[],createdAt:project.created_at});
          if(state.failAssignmentReply)return route.fulfill({status:503,json:{error:{message:'Reconnect the saved request.'}}});
          return route.fulfill({json:{assignmentId:state.assignments.get(input.requestId).id,state:'queued'}});
        }
        return route.fulfill({json:{employees,assignments:[...state.assignments.values()].filter(job=>job.input.projectId===url.searchParams.get('projectId'))}});
      }
      if(/^\/api\/studio\/assignments\/[^/]+\/review$/.test(url.pathname)){
        const job=[...state.assignments.values()].find(job=>job.id===url.pathname.split('/')[4]);assert.ok(job);job.state='completed';job.reviewDecision=input.decision;return route.fulfill({json:{ok:true}});
      }
      if(url.pathname==='/api/studio/starters'){
        const starter=starters.find(item=>item.id===input.templateId);assert.ok(starter);assert.equal(input.projectId,projectId);
        const id=input.creationId;let revision=[...state.revisions.values()].find(row=>row.assetId===id);
        if(!revision){
          state.assets.set(id,{id,project_id:projectId,app_id:starter.appId,name:starter.name,asset_kind:'native',current_revision_id:null,created_at:project.created_at});
          revision={id:randomUUID(),assetId:id,state:'uploading',revision_number:1,created_at:project.created_at,package:input.package};state.revisions.set(revision.id,revision);
        }else assert.deepEqual(revision.package,input.package);
        if(state.failCreationReply){state.failCreationReply=false;return route.abort('failed');}
        return route.fulfill({json:{revisionId:revision.id}});
      }
      if(url.pathname==='/api/studio/sources'){
        assert.equal(input.projectId,projectId);
        const id=input.creationId;
        let revision=[...state.revisions.values()].find(row=>row.assetId===id);
        if(!revision){
          const kind=input.package.files.find(file=>file.role==='master').mimeType.split('/')[0];
          state.assets.set(id,{id,project_id:projectId,app_id:null,name:input.name,asset_kind:kind,current_revision_id:null,created_at:project.created_at});
          revision={id:randomUUID(),assetId:id,state:'uploading',revision_number:1,created_at:project.created_at,package:input.package};
          state.revisions.set(revision.id,revision);
        }else assert.deepEqual(revision.package,input.package);
        if(state.failCreationReply){state.failCreationReply=false;return route.abort('failed');}
        return route.fulfill({json:{revisionId:revision.id}});
      }
      if(url.pathname==='/api/studio/assets'){
        if(method==='GET')return route.fulfill({json:{assets:[...state.assets.values()].filter(asset=>(!url.searchParams.get('projectId')||asset.project_id===url.searchParams.get('projectId'))&&(!url.searchParams.get('kind')||asset.asset_kind===url.searchParams.get('kind'))&&(!url.searchParams.get('appId')||asset.app_id===url.searchParams.get('appId'))&&asset.name.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase())).map(asset=>({...asset,project:{name:state.projects.get(asset.project_id)?.name}})),nextCursor:null}});
        assert.equal(input.projectId,projectId);
        const id=input.creationId??randomUUID();
        if(!state.assets.has(id))state.assets.set(id,{id,project_id:projectId,app_id:input.appId,name:input.name,asset_kind:'native',current_revision_id:null,created_at:project.created_at});
        if(state.failCreationReply){state.failCreationReply=false;return route.abort('failed');}
        return route.fulfill({json:{asset:state.assets.get(id)}});
      }
      const assetMatch=url.pathname.match(/^\/api\/studio\/assets\/([^/]+)(\/revisions)?$/);
      if(assetMatch){
        const asset=state.assets.get(assetMatch[1]);
        if(!assetMatch[2]){if(method==='PATCH')asset.name=input.name;return route.fulfill({json:{asset}});}
        if(method==='GET')return route.fulfill({json:{revisions:[...state.revisions.values()].filter(row=>row.assetId===asset.id),nextCursor:null}});
        const id=randomUUID();state.revisions.set(id,{id,assetId:asset.id,state:'uploading',revision_number:state.revisions.size+1,created_at:project.created_at,...input});
        return route.fulfill({json:{revisionId:id}});
      }
      const revisionMatch=url.pathname.match(/^\/api\/studio\/revisions\/([^/]+)(\/(transfers|commit|file))?$/);
      if(revisionMatch){
        const revision=state.revisions.get(revisionMatch[1]),asset=state.assets.get(revision.assetId);
        if(revisionMatch[3]==='file'){
          const file=revision.package.files.find(file=>file.path===url.searchParams.get('path'));
          if(!file)return route.fulfill({status:404});
          return route.fulfill({contentType:file.mimeType,headers:{'Content-Disposition':`${url.searchParams.get('inline')?'inline':'attachment'}; filename="${file.path.split('/').pop()}"`},body:state.bytes.get(revision.id+'/'+file.path)});
        }
        if(revisionMatch[3]==='transfers'){
          if(state.holdTransfers)await new Promise(resolve=>{state.releaseTransfers=()=>{state.holdTransfers=false;resolve();};});
          return route.fulfill({json:{bucket:'isolated',resumableEndpoint:transferOrigin+'/storage/upload/resumable',transfers:revision.package.files.map(file=>({...file,uploaded:state.bytes.has(revision.id+'/'+file.path),token:'isolated-token',storageKey:revision.id+'/'+file.path}))}});
        }
        if(revisionMatch[3]==='commit'){
          for(const file of revision.package.files){const bytes=state.bytes.get(revision.id+'/'+file.path);assert.equal(bytes?.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
          revision.state='committed';asset.current_revision_id=revision.id;
          if(state.failCommitReply){state.failCommitReply=false;return route.abort('failed');}
          return route.fulfill({json:{assetId:asset.id,revisionId:revision.id,status:'committed'}});
        }
        return route.fulfill({json:{ref:{assetId:asset.id,revisionId:revision.id},revision,dependencies:revision.package.dependencies,files:revision.package.files.map(file=>({...file,downloadUrl:fileOrigin+'/stored/'+encodeURIComponent(revision.id+'/'+file.path)}))}});
      }
      return route.fulfill({status:404,json:{error:{message:'Unexpected fixture API request'}}});
    }
    if(url.pathname.startsWith('/dashboard'))return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><title>Import workspace fixture</title><style>*,*::before,*::after{box-sizing:border-box}body,h1,h2,h3,p{margin:0}button{border:0;background:none;color:inherit;cursor:pointer}a{color:inherit}.studio-shell.project-mode{display:block}</style><link rel="stylesheet" href="/studio.css"></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:'development'}};</script><script src="/fixture.js"></script></body></html>`});
    return route.fulfill({status:404,body:'Isolated fixture'});
  });
  await page.goto(workspaceOrigin+(initialPath??`/dashboard/projects/${projectId}`));
  try{if(!initialPath||new URL(initialPath,origin).pathname===`/dashboard/projects/${projectId}`)await page.getByRole('heading',{name:'First project',exact:true}).waitFor();}catch(error){if(state.errors.length)throw Error(state.errors.join('\n'));throw error;}
  return {page,context,state};
}

export async function dropDocument(page, filename, content, target='.project-start') {
  const transfer=await page.evaluateHandle(({filename,content})=>{const data=new DataTransfer();data.items.add(new File([content],filename));return data;},{filename,content});
  await page.locator(target).dispatchEvent('dragover',{dataTransfer:transfer});
  await page.locator(target).dispatchEvent('drop',{dataTransfer:transfer});
  await transfer.dispose();
}

export async function openEmployeeWorkspace(page) {
  await page.locator('.project-header').getByRole('link',{name:'AI Employees',exact:true}).click();
  await page.getByRole('heading',{name:'AI Employees.',exact:true}).waitFor();
  return page;
}
