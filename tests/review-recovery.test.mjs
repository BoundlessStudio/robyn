import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

test('review notes and the original decision survive reload and an uncertain acknowledgement',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),project=randomUUID(),job=randomUUID();
  const bundle=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {AssignmentPanel} from './src/components/studio/AssignmentPanel';createRoot(document.getElementById('root')).render(<AssignmentPanel projectId="${project}" mode="review" onOpen={()=>{}}/>);`,resolveDir:root,sourcefile:'fixture.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);const calls=[],persisted=[];let acknowledge=false;
    await context.route('**/*',async route=>{const url=new URL(route.request().url());
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
      if(url.pathname.endsWith('/review')){calls.push(route.request().postDataJSON());persisted.push(await page.evaluate(({project,job})=>JSON.parse(localStorage.getItem('robyn-review-drafts:'+project))[job].pending,{project,job}));return route.fulfill(acknowledge?{json:{ok:true}}:{status:503,json:{error:{message:'Review may already be saved; reconnect.'}}});}
      if(url.pathname==='/api/studio/assignments')return route.fulfill({json:{employees:[],assignments:[{id:job,role:'Researcher',appId:'research',brief:'Continue the exact notebook',state:'awaiting_review',createdAt:'2026-10-25T00:00:00Z',deliverables:[]}]}});
      return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script src="/fixture.js"></script>'});
    });
    await page.goto('https://review.test/');await page.getByLabel('Notes for the next pass').fill('Keep the citations and refine the conclusion.');await page.reload();assert.equal(await page.getByLabel('Notes for the next pass').inputValue(),'Keep the citations and refine the conclusion.');
    await page.getByRole('button',{name:'Request changes',exact:true}).click();await page.getByRole('alert').waitFor();assert.deepEqual(persisted[0],calls[0]);
    await page.reload();await page.getByRole('button',{name:'Reconnect review'}).waitFor();assert.equal(await page.getByLabel('Notes for the next pass').getAttribute('readonly'),'');
    acknowledge=true;await page.getByRole('button',{name:'Reconnect review'}).click();await page.getByText('Your changes are with the same employee, using these exact revisions.').waitFor();
    assert.deepEqual(calls[1],calls[0]);assert.equal(new Set(calls.map(c=>c.requestId)).size,1);
    assert.equal(await page.evaluate(({project,job})=>JSON.parse(localStorage.getItem('robyn-review-drafts:'+project))[job],{project,job}),undefined);
  }finally{await browser.close();}
});
