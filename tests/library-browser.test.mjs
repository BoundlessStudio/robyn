import test from "node:test";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {nativeImportFixture,origin,projectId} from "./fixtures/native-import.mjs";

test("the real library discovers the 301st asset and sends searches to the server",async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    const requests=[];
    const assets=Array.from({length:405},(_,i)=>({id:`asset-${i+1}`,project_id:projectId,app_id:'research',name:i===300?'Old exact notebook':`Notebook ${i+1}`,current_revision_id:`revision-${i+1}`,asset_kind:'native',project:{name:'A project'}}));
    await page.route('**/api/studio/assets?*',route=>{
      const url=new URL(route.request().url());requests.push(url);
      assert.equal(url.searchParams.get('projectId'),projectId);
      const matches=assets.filter(row=>row.name.toLowerCase().includes((url.searchParams.get('q')??'').toLowerCase()));const start=Number(url.searchParams.get('cursor')??0);
      return route.fulfill({json:{assets:matches.slice(start,start+100),nextCursor:start+100<matches.length?String(start+100):null}});
    });
    await page.goto(`${origin}/dashboard/projects/${projectId}/library`);await page.getByRole('heading',{name:'Notebook 100',exact:true}).waitFor();
    for(const number of [200,300]){await page.getByRole('button',{name:'Load more assets'}).click();await page.getByRole('heading',{name:`Notebook ${number}`,exact:true}).waitFor();}
    await page.getByRole('button',{name:'Load more assets'}).click();await page.getByRole('heading',{name:'Old exact notebook',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search assets'}).fill('Old exact');await page.getByRole('heading',{name:'Old exact notebook',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.studio-library-piece').length===1);
    assert.equal(requests.at(-1).searchParams.get('q'),'Old exact');assert.equal(requests.at(-1).searchParams.get('cursor'),null);
    assert.deepEqual(requests.filter(url=>url.searchParams.has('cursor')).map(url=>url.searchParams.get('cursor')),['100','200','300']);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
