import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {chromium} from "playwright";
import {fileURLToPath} from "node:url";

test("the real library discovers the 301st asset and sends searches to the server",async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const bundle=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {StudioLibrary} from './src/components/studio/StudioLibrary';createRoot(document.getElementById('root')).render(<StudioLibrary/>);`,resolveDir:root,sourcefile:'fixture.tsx',loader:'tsx'},jsx:'automatic',bundle:true,write:false,platform:'browser',format:'iife',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react";export default function Link(props){return React.createElement("a",props)}',loader:'js',resolveDir:root}));}}]});
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',error=>console.error(error.message));page.setDefaultTimeout(10000);
    const requests=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
    const assets=Array.from({length:405},(_,i)=>({id:`asset-${i+1}`,project_id:'project',app_id:'research',name:i===300?'Old exact notebook':`Notebook ${i+1}`,current_revision_id:`revision-${i+1}`,asset_kind:'native',project:{name:'A project'}}));
    await context.route('**/*',route=>{const url=new URL(route.request().url());
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
      if(url.pathname==='/api/studio/assets'){requests.push(url);const matches=assets.filter(row=>row.name.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase()));const start=Number(url.searchParams.get('cursor')??0);return route.fulfill({json:{assets:matches.slice(start,start+100),nextCursor:start+100<matches.length?String(start+100):null}});}
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script src="/fixture.js"></script></body></html>'});
      return route.fulfill({status:404,body:'isolated fixture'});
    });
    await page.goto('https://library.test/');await page.getByRole('heading',{name:'Notebook 100',exact:true}).waitFor();
    for(const number of [200,300]){await page.getByRole('button',{name:'Load more assets'}).click();await page.getByRole('heading',{name:`Notebook ${number}`,exact:true}).waitFor();}
    await page.getByRole('button',{name:'Load more assets'}).click();await page.getByRole('heading',{name:'Old exact notebook',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search assets'}).fill('Old exact');await page.getByRole('heading',{name:'Old exact notebook',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.studio-library-piece').length===1);
    assert.equal(requests.at(-1).searchParams.get('q'),'Old exact');assert.equal(requests.at(-1).searchParams.get('cursor'),null);
    assert.deepEqual(requests.filter(url=>url.searchParams.has('cursor')).map(url=>url.searchParams.get('cursor')),['100','200','300']);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
