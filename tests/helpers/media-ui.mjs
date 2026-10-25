import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export async function mediaUiFixture(browser,{availableMicros=10000000,lostFirstReply=false,viewport={width:1440,height:1000},deviceScaleFactor=1}={}){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const bundle=await build({stdin:{contents:`import {useState,useCallback} from 'react';import {createRoot} from 'react-dom/client';import {MediaPanel} from './src/components/studio/MediaPanel';function Fixture(){const[open,setOpen]=useState(false);const saved=useCallback(async()=>{},[]);return <main className="studio-shell"><div className="studio-page"><h1>Project media</h1><button className="studio-button" onClick={()=>setOpen(true)}>Open media</button><iframe title="Isolated unsaved editor" src="/editor"/>{open&&<MediaPanel projectId="00000000-0000-4000-8000-000000000001" assets={[]} close={()=>setOpen(false)} onSaved={saved} onOpen={saved}/>}</div></main>}createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:root,sourcefile:'media-fixture.tsx',loader:'tsx'},jsx:'automatic',bundle:true,write:false,platform:'browser',format:'iife',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
  const css=await readFile(root+'src/app/dashboard/studio.css','utf8');
  const context=await browser.newContext({viewport,deviceScaleFactor,reducedMotion:'reduce'}),page=await context.newPage();
  const requests=[],errors=[],jobs=[];
  page.on('pageerror',error=>errors.push(error.message));
  const headers={'content-type':'application/json'};
  await context.route('https://media-ui.test/**',async route=>{
    const url=new URL(route.request().url()),method=route.request().method();
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
    if(url.pathname==='/studio.css')return route.fulfill({contentType:'text/css',body:css});
    if(url.pathname==='/editor')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><title>Isolated unsaved state</title><label>Unsaved title<input value="Keep this edit"></label></html>'});
    if(url.pathname==='/api/studio/media/search')return route.fulfill({headers,body:JSON.stringify({results:[]})});
    if(url.pathname==='/api/studio/media/jobs'){
      if(method==='GET')return route.fulfill({headers,body:JSON.stringify({jobs,budget:{availableMicros,reason:null},providers:{perflo:{configured:true}},nextCursor:null})});
      const body=route.request().postDataJSON();requests.push(body);
      if(!jobs.length)jobs.push({id:'00000000-0000-4000-8000-000000000002',name:body.name,provider:'perflo',kind:'audio',state:'running',reservedMicros:2733,actualMicros:null,billingSettled:false,errorCode:null,ref:null,canCancel:false,needsSettlement:false});
      return route.fulfill({headers,status:lostFirstReply&&requests.length===1?503:200,body:JSON.stringify(lostFirstReply&&requests.length===1?{error:{message:'Saved; acknowledgement unavailable'}}:{job:jobs[0]})});
    }
    if(url.pathname.startsWith('/api/'))throw Error('Unexpected fixture API '+url.pathname);
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Media accessibility fixture</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#22231d}h1{color:#f1f0e8}iframe{display:block;width:100%;height:150px;margin-top:20px;background:white}</style><link rel="stylesheet" href="/studio.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
  });
  await page.goto('https://media-ui.test/');
  return {context,page,requests,errors,setBudget:value=>{availableMicros=value;}};
}
