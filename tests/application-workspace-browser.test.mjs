import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';
import {applicationLaunchUrl,launchableApps} from '../src/studio/application-launch.ts';
import {studioApps} from '../src/studio/apps/registry.ts';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const apps=launchableApps.filter(app=>app.editor.mode!=='readOnly').map(app=>app.name);
const ready=(page,app)=>page.frameLocator(`iframe[title="${app} editor"]`).getByText('Ready',{exact:true}).waitFor();
async function chooseApplication(page,app){
  await page.getByRole('button',{name:'New file',exact:true}).click();
  await page.getByRole('dialog',{name:'Your applications.'}).getByRole('button',{name:app,exact:false}).click();
}

test('empty and populated projects list the independent catalogue and launch ready applications without AI allowance',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);state.allowance=0;
    assert.deepEqual(await page.locator('.application-grid button').evaluateAll(nodes=>nodes.map(node=>node.querySelector('strong').textContent)),studioApps.map(app=>app.name));
    for(const [name,count] of [['Creative',10],['Drafting',9],['Analysis',7]]){
      const group=page.getByRole('region',{name:`${name} studio`,exact:true});
      assert.equal(await group.locator('button').count(),count);
      assert.deepEqual(await group.locator('strong').allTextContents(),studioApps.filter(app=>app.studio===name).map(app=>app.name));
    }
    assert.equal(await page.locator('.application-grid a').count(),0);
    assert.equal(await page.getByRole('link',{name:'Talk to Robyn',exact:true}).count(),1);
    for(const app of studioApps.filter(app=>!launchableApps.some(ready=>ready.id===app.id)))assert.equal(await page.getByRole('button',{name:app.name,exact:false}).isDisabled(),true);
    const applications=page.getByRole('button',{name:'New file',exact:true});
    assert.equal(await applications.count(),0);
    for(const app of apps){
      await page.getByRole('button',{name:app,exact:false}).click();await ready(page,app);
      assert.equal(await applications.isVisible(),true);
      assert.equal(await page.getByRole('button',{name:'Files',exact:true}).count(),0);
      await page.locator('.project-tabs .close-tab').click();
      await page.getByRole('button',{name:app,exact:false}).waitFor();
      assert.equal(await applications.count(),0);
      await page.goto(`${origin}/dashboard/projects/${projectId}`);
      await page.getByRole('button',{name:app,exact:false}).waitFor();
      assert.equal(await page.locator('iframe').count(),0);
    }
    assert.equal(state.assets.size,apps.length);assert.equal(state.revisions.size,apps.length);assert.equal(state.assignments.size,0);
    assert.equal(state.requests.filter(req=>req.path.includes('/budgets/')).length,0);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('read-only applications select exact saved reports without creating blank assets or revisions',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);state.allowance=0;
    await page.getByRole('button',{name:'DashCraft',exact:false}).click();
    const picker=page.getByRole('dialog',{name:'Open DashCraft report.',exact:true});
    await picker.getByText('This project has no saved reports for this application yet.').waitFor();
    assert.equal(state.assets.size,0);assert.equal(state.revisions.size,0);
    assert.equal(state.requests.filter(req=>req.method==='POST').length,0);
    const assetId=randomUUID(),revisionId=randomUUID(),bytes=Buffer.from('Exact saved report input');
    const file={path:'Example.pbit',role:'master',mimeType:'application/octet-stream',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    state.assets.set(assetId,{id:assetId,project_id:projectId,app_id:'dashcraft',name:'Quarterly sales',asset_kind:'native',current_revision_id:revisionId,created_at:state.project.created_at});
    state.revisions.set(revisionId,{id:revisionId,assetId,state:'committed',revision_number:1,created_at:state.project.created_at,package:{files:[file],dependencies:[],message:'Component transport fixture'}});
    state.bytes.set(revisionId+'/'+file.path,bytes);
    await picker.getByLabel('Search reports',{exact:true}).fill('Quarter');
    await picker.getByRole('button',{name:'Quarterly sales',exact:true}).waitFor();
    const query=state.requests.filter(req=>req.path==='/api/studio/assets').at(-1);
    assert.equal(new URLSearchParams(query.search).get('q'),'Quarter');
    assert.equal(new URLSearchParams(query.search).get('projectId'),projectId);
    assert.equal(new URLSearchParams(query.search).get('appId'),'dashcraft');
    await picker.getByRole('button',{name:'Quarterly sales',exact:true}).click();
    await page.frameLocator('iframe[title="DashCraft viewer"]').getByText('Ready',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('asset'),assetId);
    assert.equal(new URL(page.url()).searchParams.get('revision'),revisionId);
    assert.equal(await page.locator('.project-save-state').innerText(),'Read only');
    await page.reload();await page.frameLocator('iframe[title="DashCraft viewer"]').getByText('Ready',{exact:true}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);assert.equal(state.assignments.size,0);
    assert.equal(state.requests.filter(req=>req.method==='POST').length,0);
    assert.deepEqual(state.errors,[]);
    await chooseApplication(page,'WordCraft');await ready(page,'WordCraft');
    const text=page.frameLocator('iframe').getByLabel('Document text');
    await text.fill('Keep my unsaved document while choosing a report.');
    await page.locator('.project-save-state[data-state="dirty"]').waitFor();
    let discardPrompts=0;
    const refuse=dialog=>{discardPrompts++;void dialog.dismiss();};page.on('dialog',refuse);
    await chooseApplication(page,'DashCraft');
    const secondPicker=page.getByRole('dialog',{name:'Open DashCraft report.',exact:true});
    await secondPicker.getByRole('button',{name:'Quarterly sales',exact:true}).click();
    assert.equal(discardPrompts,1,'only selecting the exact report asks to leave the unsaved document');
    assert.equal(await text.inputValue(),'Keep my unsaved document while choosing a report.');
    assert.equal(await secondPicker.isVisible(),true);
    page.removeListener('dialog',refuse);page.once('dialog',dialog=>dialog.accept());
    await secondPicker.getByRole('button',{name:'Quarterly sales',exact:true}).click();
    await page.frameLocator('iframe[title="DashCraft viewer"]').getByText('Ready',{exact:true}).waitFor();
    assert.equal(state.assets.size,2);assert.equal(state.revisions.size,2);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('a report picker refuses a foreign project response before selection and preserves the current editor',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();await ready(page,'WordCraft');
    const source=await page.locator('iframe').getAttribute('src');
    await page.route('**/api/studio/assets?**',async route=>route.fulfill({json:{assets:[{id:randomUUID(),project_id:randomUUID(),app_id:'dashcraft',name:'Foreign report',current_revision_id:randomUUID()}],nextCursor:null}}));
    await chooseApplication(page,'DashCraft');
    const picker=page.getByRole('dialog',{name:'Open DashCraft report.',exact:true});
    await picker.getByRole('alert').filter({hasText:'The report list did not match this project.'}).waitFor();
    assert.equal(await picker.getByRole('button',{name:'Foreign report',exact:true}).count(),0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('iframe').getAttribute('src'),source);
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('application chooser, cancelled launch and narrowing preserve the live unsaved editor',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();await ready(page,'WordCraft');
    const editor=page.frameLocator('iframe'),src=await page.locator('iframe').getAttribute('src');
    await editor.getByLabel('Document text').fill('Keep these unsaved words.');
    await page.locator('.project-save-state[data-state="dirty"]').waitFor();
    await page.getByRole('button',{name:'New file',exact:true}).click();
    await page.getByRole('dialog',{name:'Your applications.'}).waitFor();
    assert.equal(await page.locator('iframe').getAttribute('src'),src);
    page.once('dialog',dialog=>dialog.dismiss());
    await page.getByRole('dialog').getByRole('button',{name:'GridCraft',exact:false}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('group',{name:'Workspace tools',exact:true}).count(),0);
    assert.equal(await page.getByRole('complementary',{name:'Project files',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Project details',exact:true}).count(),0);
    page.once('dialog',dialog=>dialog.dismiss());await chooseApplication(page,'WordCraft');
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:900,height:850});
    await page.getByRole('dialog',{name:/Open on.*desktop/}).waitFor();
    assert.equal(await page.locator('iframe').count(),1);
    await page.setViewportSize({width:1440,height:960});
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep these unsaved words.');
    assert.equal(await page.locator('iframe').getAttribute('src'),src);assert.equal(state.assets.size,1);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('application chooser creates separate saved files; rename preserves native paths and editor state',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();await ready(page,'WordCraft');
    const asset=[...state.assets.values()][0],revision=state.revisions.get(asset.current_revision_id),paths=revision.package.files.map(file=>file.path);
    const source=await page.locator('iframe').getAttribute('src');
    await page.getByRole('button',{name:'Rename file: Untitled document'}).click();
    await page.getByLabel('File name',{exact:true}).fill('My new document');await page.getByRole('button',{name:'Save file name',exact:true}).click();
    await page.getByRole('button',{name:'Rename file: My new document'}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);assert.equal(asset.name,'My new document');assert.deepEqual(revision.package.files.map(file=>file.path),paths);
    assert.equal(await page.locator('iframe').getAttribute('src'),source);
    await chooseApplication(page,'WordCraft');
    await page.waitForFunction(old=>document.querySelector('iframe')?.src!==old,source);await ready(page,'WordCraft');
    assert.equal(state.assets.size,2);assert.equal(state.revisions.size,2);
    await chooseApplication(page,'GridCraft');await ready(page,'GridCraft');
    assert.equal(state.assets.size,3);
    for(const craft of ['DeckCraft','PhotoCraft','PdfCraft','SoundCraft','FilmCraft']){
      await chooseApplication(page,craft);await ready(page,craft);
    }
    await page.goto(`${origin}/dashboard/projects/${projectId}?asset=${asset.id}`);await ready(page,'WordCraft');
    await page.getByRole('button',{name:'Rename file: My new document'}).waitFor();
    assert.equal(state.assets.size,8);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('application launch links preserve the chosen application and launch identity through refresh',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    state.failCreationReply=true;await page.goto(origin+applicationLaunchUrl(projectId,'gridcraft',randomUUID()));await page.getByRole('button',{name:'Continue opening GridCraft',exact:true}).waitFor();
    const launchUrl=new URL(page.url());assert.equal(launchUrl.pathname,`/dashboard/projects/${projectId}`);assert.equal(launchUrl.searchParams.get('app'),'gridcraft');
    const creation=[...state.assets.keys()][0];assert.equal(creation,launchUrl.searchParams.get('launch'));
    await page.reload();await ready(page,'GridCraft');
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);assert.equal(new URL(page.url()).searchParams.get('asset'),creation);
    assert.equal(new URL(page.url()).searchParams.has('launch'),false);
    await page.reload();await ready(page,'GridCraft');assert.equal(state.assets.size,1);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('an uncertain start cannot be repurposed, and archived projects cannot start files',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);state.failCreationReply=true;
    await page.getByRole('button',{name:'WordCraft',exact:false}).dblclick();
    await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).waitFor();
    await page.goto(`${origin}/dashboard/projects/${projectId}?app=gridcraft&launch=${randomUUID()}`);
    await page.getByRole('alert').filter({hasText:'Another document'}).waitFor();
    assert.equal(state.assets.size,1);assert.equal([...state.assets.values()][0].app_id,'wordcraft');
    await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).click();await ready(page,'WordCraft');
    const archived=await nativeImportFixture(browser,{archived:true});
    assert.equal(await archived.page.getByRole('button',{name:'WordCraft',exact:false}).isDisabled(),true);
    assert.equal(archived.state.assets.size,0);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('resuming a failed launch protects edits made after closing its recovery dialog',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();await ready(page,'WordCraft');
    state.failCreationReply=true;
    await chooseApplication(page,'GridCraft');
    await page.getByRole('button',{name:'Continue opening GridCraft',exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const editor=page.frameLocator('iframe'),text=editor.getByLabel('Document text');
    await text.click();await text.press('ControlOrMeta+a');await text.pressSequentially('Work added during recovery.');
    await page.locator('.project-save-state[data-state="dirty"]').waitFor();
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Continue opening GridCraft',exact:true}).click();
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Work added during recovery.');
    assert.equal(await page.locator('iframe[title="GridCraft editor"]').count(),0);
    await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Continue opening GridCraft',exact:true}).click();await ready(page,'GridCraft');
    assert.equal(state.assets.size,2);assert.equal(state.revisions.size,3);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
