import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];

test('project page links precede panel actions and navigate in the same tab with unsaved-work protection',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:'/dashboard'});
    const navigation=page.getByRole('navigation',{name:'Studio navigation'});
    await navigation.waitFor();
    for(const name of ['Asset Library','AI Employees','Research','Applications','Settings'])assert.equal(await navigation.getByRole('link',{name,exact:true}).count(),0);
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'First project',exact:true})}).click();
    await page.getByRole('button',{name:'Robyn studio menu',exact:true}).click();
    for(const name of ['Asset Library','AI Employees','Research','Applications','Settings']){
      const item=page.getByRole('menuitem',{name,exact:true});
      assert.match(await item.getAttribute('href'),new RegExp(`/dashboard/projects/${projectId}/`));assert.equal(await item.getAttribute('target'),null);
    }
    await page.getByRole('menuitem',{name:'Applications',exact:true}).click();
    await page.getByRole('button',{name:'Open GridCraft in project',exact:true}).waitFor();
    assert.equal(page.context().pages().length,1);
    await page.getByRole('link',{name:'First project',exact:true}).click();
    const header=page.locator('.project-header-actions');
    await header.getByRole('link',{name:'Assets',exact:true}).waitFor();
    assert.deepEqual(await header.locator('a,button').allTextContents(),['Assets','AI Employees','Research','Settings','Open existing','Files','Project details']);
    for(const target of await header.locator('a').evaluateAll(links=>links.map(link=>link.target)))assert.equal(target,'');
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();
    const editor=page.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();
    await editor.getByLabel('Document text').fill('Keep this unsaved draft open.');
    await page.locator('.project-save-state[data-state="dirty"]').waitFor();
    assert.deepEqual(await header.locator('a,button').allTextContents(),['Assets','AI Employees','Research','Settings','Applications','Open existing','Files','Project details']);
    let blocked=false;page.once('dialog',async dialog=>{blocked=true;assert.match(dialog.message(),/unsaved work/);await dialog.dismiss();});
    await header.getByRole('link',{name:'Assets',exact:true}).click();
    assert.equal(blocked,true);assert.equal(new URL(page.url()).pathname,`/dashboard/projects/${projectId}`);
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep this unsaved draft open.');
    await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
    await header.getByRole('link',{name:'Assets',exact:true}).click();
    const tools=page;
    await tools.getByRole('heading',{name:'Assets.',exact:true}).waitFor();
    assert.equal(await tools.getByLabel('Filter by project').count(),0);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'AI Employees',exact:true}).click();
    await tools.getByLabel('Your idea',{exact:true}).waitFor();
    assert.equal(await tools.getByLabel('Employee project').count(),0);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Research',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'Research has control'}).waitFor();
    const poll=tools.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/studio/research/browser');
    await tools.getByRole('button',{name:'Take over',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'You have control'}).waitFor();
    await tools.getByRole('button',{name:'Return control',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'Research has control'}).waitFor();await poll;
    assert.equal(await tools.getByRole('link',{name:'Project briefs',exact:false}).getAttribute('href'),`/dashboard/projects/${projectId}/employees?view=assignments`);
    const requests=state.requests.filter(row=>['/api/studio/research/browser','/api/studio/assets','/api/studio/assignments'].includes(row.path));
    assert.ok(requests.length>4);assert.ok(requests.every(row=>new URLSearchParams(row.search).get('projectId')===projectId));
    const controls=requests.filter(row=>['take','return'].includes(row.input?.action));assert.equal(controls.length,2);assert.equal(controls[0].input.controlId,controls[1].input.controlId);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Applications',exact:true}).click();
    await tools.getByRole('button',{name:'Open GridCraft in project',exact:true}).waitFor();
    assert.equal(await tools.getByRole('navigation',{name:'Choose a project for application'}).count(),0);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Settings',exact:true}).click();
    await tools.getByLabel('Studio name',{exact:true}).waitFor();
    for(const width of [1440,1200]){
      await tools.setViewportSize({width,height:960});
      assert.equal(await tools.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for(const name of ['Asset Library','AI Employees','Research','Applications','Settings'])assert.match(await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name,exact:true}).getAttribute('href'),new RegExp(`/dashboard/projects/${projectId}/`));
    }
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'AI Employees',exact:true}).click();
    await tools.getByLabel('Your idea',{exact:true}).waitFor();
    assert.equal(await tools.getByRole('link',{name:'Manage AI budget',exact:false}).getAttribute('href'),`/dashboard/projects/${projectId}/settings#studio-budget`);
    assert.equal(state.assignments.size,0);
    assert.equal(page.context().pages().length,1);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('asset lists and detail pages retain project identity and old asset links resolve to their project',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();
    await page.frameLocator('iframe[title="WordCraft editor"]').getByText('Ready',{exact:true}).waitFor();
    const asset=[...state.assets.values()][0],otherProject=randomUUID(),otherAsset=randomUUID();
    state.projects.set(otherProject,{...state.project,id:otherProject,name:'Another project'});
    state.assets.set(otherAsset,{...asset,id:otherAsset,project_id:otherProject,name:'A different project document'});
    await page.goto(`${origin}/dashboard/projects/${projectId}/library`);
    await page.getByRole('heading',{name:asset.name,exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'A different project document',exact:true}).count(),0);
    await page.goto(`${origin}/dashboard/projects/${otherProject}/library`);
    await page.getByRole('heading',{name:'A different project document',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:asset.name,exact:true}).count(),0);
    const count=state.requests.length;
    await page.goto(`${origin}/dashboard/projects/${projectId}/library/${otherAsset}?revision=${asset.current_revision_id}`);
    await page.getByRole('alert').filter({hasText:'This asset does not belong to this project.'}).waitFor();
    assert.equal(state.requests.slice(count).some(row=>row.path.includes('/revisions')),false);
    assert.equal(await page.getByRole('button',{name:'Import revision',exact:true}).count(),0);
    await page.goto(`${origin}/dashboard/library/${asset.id}?revision=${asset.current_revision_id}`);
    await page.getByRole('heading',{name:asset.name,exact:true}).waitFor();
    const url=new URL(page.url());assert.equal(url.pathname,`/dashboard/projects/${projectId}/library/${asset.id}`);assert.equal(url.searchParams.get('revision'),asset.current_revision_id);
    await page.getByRole('link',{name:'Back to assets',exact:true}).click();
    await page.getByRole('heading',{name:'Assets.',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,`/dashboard/projects/${projectId}/library`);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('unavailable projects do not load assets, employees or Research',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:'/dashboard'});
    for(const section of ['library','employees','research','applications','settings']){
      const count=state.requests.length;
      await page.goto(`${origin}/dashboard/projects/${randomUUID()}/${section}`);
      await page.getByRole('alert').filter({hasText:'Project not found.'}).waitFor();
      assert.ok(state.requests.slice(count).every(row=>row.path.startsWith('/api/studio/projects/')));
    }
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
