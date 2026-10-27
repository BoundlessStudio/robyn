import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
let script;
async function fixture(browser,{existing=[],lost=false}={}){
  script??=(await build({stdin:{contents:`import {StrictMode,useState,useEffect} from 'react';import{createRoot}from'react-dom/client';import{StudioProjects}from'./src/components/studio/StudioProjects';import{NewProject}from'./src/components/studio/NewProject';function Entry(){const[path,setPath]=useState(location.pathname);useEffect(()=>{const h=()=>setPath(location.pathname);addEventListener('popstate',h);return()=>removeEventListener('popstate',h)},[]);return path==='/dashboard'?<StudioProjects/>:path==='/dashboard/projects/new'?<NewProject/>:<h1>Canvas opened</h1>}createRoot(document.getElementById('root')).render(<StrictMode><Entry/></StrictMode>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(link|image|navigation)$/},args=>({path:args.path,namespace:'next-fixture'}));b.onLoad({filter:/.*/,namespace:'next-fixture'},args=>({loader:'js',resolveDir:root,contents:args.path.endsWith('navigation')?'const go=(url)=>{history.pushState(null,"",url);dispatchEvent(new PopStateEvent("popstate"))};const router={push:go,replace:go};export const useRouter=()=>router;':`import React from 'react';export default function Component(p){return React.createElement('${args.path.endsWith('link')?'a':'img'}',p)}`}));}}]})).outputFiles[0].text;
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(8000);
  const state={projects:new Map(existing.map(p=>[p.id,p])),requests:[],lost};
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:script});
    if(url.pathname==='/api/studio/projects'){
      if(req.method()==='POST'){
        const input=req.postDataJSON();state.requests.push(input);state.projects.set(input.creationId,{...input,id:input.creationId,status:'active',updated_at:new Date().toISOString()});
        if(state.lost){state.lost=false;return route.fulfill({status:503,json:{error:{message:'Opening was interrupted. Try again.'}}});}
        return route.fulfill({json:{project:state.projects.get(input.creationId)}});
      }
      const status=url.searchParams.get('status');return route.fulfill({json:{projects:[...state.projects.values()].filter(p=>!status||p.status===status)}});
    }
    if(url.pathname.startsWith('/dashboard'))return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
    return route.fulfill({status:404,body:'Isolated fixture'});
  });
  return{page,state,context};
}

test('first entry stays in Projects and an explicit new project recovers the same identity',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const{page,state}=await fixture(browser,{lost:true});await page.goto('https://entry.test/dashboard');
    await page.getByRole('button',{name:'New project',exact:true}).waitFor();assert.equal(state.requests.length,0);
    assert.equal(new URL(page.url()).pathname,'/dashboard');
    await page.getByRole('button',{name:'New project',exact:true}).click();
    await page.getByRole('button',{name:'Try opening again',exact:true}).waitFor();
    assert.equal(state.requests.length,1,'StrictMode does not duplicate creation');assert.equal(state.requests[0].name,'Untitled project');assert.equal(state.requests[0].brief,'');
    const id=state.requests[0].creationId;assert.equal(new URL(page.url()).searchParams.get('request'),id);
    await page.reload();await page.getByRole('heading',{name:'Canvas opened',exact:true}).waitFor();
    assert.equal(state.projects.size,1);assert.deepEqual(state.requests[1],state.requests[0]);assert.equal(new URL(page.url()).pathname,`/dashboard/projects/${id}`);
  }finally{await browser.close();}
});
test('archived projects do not count as an empty studio and New project opens a fresh canvas',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const{page,state}=await fixture(browser,{existing:[{id:'archived',name:'Finished work',brief:'',status:'archived',updated_at:new Date().toISOString()}]});await page.goto('https://entry.test/dashboard');
    await page.getByRole('button',{name:'New project',exact:true}).waitFor();assert.equal(state.requests.length,0);
    await page.getByRole('button',{name:'New project',exact:true}).click();await page.getByRole('heading',{name:'Canvas opened',exact:true}).waitFor();assert.equal(state.projects.size,2);
  }finally{await browser.close();}
});

test('new project retains the catalogue application and document identity after an uncertain creation',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const{page,state}=await fixture(browser,{lost:true});
    const launch='22222222-2222-4222-8222-222222222222';
    await page.goto(`https://entry.test/dashboard/projects/new?app=gridcraft&launch=${launch}`);
    await page.getByRole('button',{name:'Try opening again',exact:true}).waitFor();
    await page.reload();await page.getByRole('heading',{name:'Canvas opened',exact:true}).waitFor();
    assert.equal(state.projects.size,1);assert.deepEqual(state.requests[1],state.requests[0]);
    const url=new URL(page.url());assert.equal(url.searchParams.get('app'),'gridcraft');assert.equal(url.searchParams.get('launch'),launch);
  }finally{await browser.close();}
});
