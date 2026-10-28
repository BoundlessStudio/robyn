import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const apps=['PhotoCraft','VectorCraft','LightCraft','FilmCraft','EffectCraft','SoundCraft','DesignCraft','PdfCraft','WordCraft','DeckCraft','GridCraft','FigCraft','CADCraft'];
const ready=(page,app)=>page.frameLocator(`iframe[title="${app} editor"]`).getByText('Ready',{exact:true}).waitFor();
async function chooseApplication(page,app){
  await page.getByRole('button',{name:'New file',exact:true}).click();
  await page.getByRole('dialog',{name:'Your applications.'}).getByRole('button',{name:app,exact:false}).click();
}

test('empty and populated projects lead with all thirteen applications and launch without AI allowance',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);state.allowance=0;
    assert.deepEqual(await page.locator('.application-grid button').evaluateAll(nodes=>nodes.map(node=>node.querySelector('strong').textContent)),apps);
    const applications=page.getByRole('button',{name:'New file',exact:true});
    assert.equal(await applications.count(),0);
    for(const app of apps){
      await page.getByRole('button',{name:app,exact:false}).click();await ready(page,app);
      assert.equal(await applications.isVisible(),true);
      assert.equal(await page.getByRole('button',{name:'Files',exact:true}).getAttribute('aria-expanded'),'false');
      await page.locator('.project-tabs .close-tab').click();
      await page.getByRole('button',{name:app,exact:false}).waitFor();
      assert.equal(await applications.count(),0);
      await page.goto(`${origin}/dashboard/projects/${projectId}`);
      await page.getByRole('button',{name:app,exact:false}).waitFor();
      assert.equal(await page.locator('iframe').count(),0);
    }
    assert.equal(state.assets.size,13);assert.equal(state.revisions.size,13);assert.equal(state.assignments.size,0);
    assert.equal(state.requests.filter(req=>req.path.includes('/budgets/')).length,0);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('application chooser, supporting panels, cancelled launch and narrowing preserve the live unsaved editor',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();await ready(page,'WordCraft');
    const editor=page.frameLocator('iframe'),src=await page.locator('iframe').getAttribute('src');
    await editor.getByLabel('Document text').fill('Keep these unsaved words.');
    await page.getByRole('button',{name:'New file',exact:true}).click();
    await page.getByRole('dialog',{name:'Your applications.'}).waitFor();
    assert.equal(await page.locator('iframe').getAttribute('src'),src);
    page.once('dialog',dialog=>dialog.dismiss());
    await page.getByRole('dialog').getByRole('button',{name:'GridCraft',exact:false}).click();
    await page.keyboard.press('Escape');
    for(const label of ['Files','Project details']){
      const button=page.getByRole('group',{name:'Workspace tools',exact:true}).getByRole('button',{name:label,exact:true});
      await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');
      await button.click();assert.equal(await button.getAttribute('aria-expanded'),'false');
    }
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

test('project catalogue opens the chosen application directly and preserves its launch identity through refresh',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/applications`});
    const open=page.getByRole('button',{name:'Open GridCraft in project',exact:true});await open.waitFor();
    assert.equal(await page.getByRole('navigation',{name:'Choose a project for application'}).count(),0);
    state.failCreationReply=true;await open.click();await page.getByRole('button',{name:'Continue opening GridCraft',exact:true}).waitFor();
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
