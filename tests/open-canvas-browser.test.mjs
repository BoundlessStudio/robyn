import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,openEmployeeWorkspace,projectId,origin} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
import {studioApps} from "../src/studio/apps/registry.ts";
import {isAppReady} from "../src/studio/manifest.ts";
const starters=JSON.parse(await readFile(new URL('../src/studio/generated/blank-starters.json',import.meta.url),'utf8'));

test('application workspace renames its project and opens its dedicated employee page',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page:workspace,state}=await nativeImportFixture(browser,{viewport:{width:1200,height:850}});
    let page=workspace;
    assert.equal(await page.locator('.application-grid button').count(),studioApps.length);
    await page.getByRole('button',{name:'Rename project: First project'}).click();
    await page.getByLabel('Project name',{exact:true}).fill('Garden guide');await page.getByRole('button',{name:'Save name',exact:true}).click();
    await page.getByRole('heading',{name:'Garden guide',exact:true}).waitFor();
    await page.getByRole('button',{name:'Rename project: Garden guide'}).click();
    await page.getByLabel('Project name',{exact:true}).fill('Discard');await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'Garden guide',exact:true}).count(),1);
    page=await openEmployeeWorkspace(workspace);
    await page.getByLabel('Your idea',{exact:true}).fill('A welcoming guide to our garden.');
    await page.getByRole('button',{name:'Jobs',exact:true}).click();
    await page.getByRole('button',{name:'Conversation',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('textarea')?.value==='A welcoming guide to our garden.');
    assert.equal(await page.getByLabel('Your idea',{exact:true}).inputValue(),'A welcoming guide to our garden.');
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('idea planning shows allowance, freezes the choice across lost replies and reload, then accepts a new draft',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/employees`});state.failAssignmentReply=true;
    await page.getByLabel('Your idea',{exact:true}).fill('A garden guide. Help me find a direction.');
    await page.getByText('$5.00 available to Robyn',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Help me plan',exact:true}).click();
    await page.getByRole('alert').waitFor();
    const first=state.requests.find(req=>req.path==='/api/studio/assignments'&&req.method==='POST').input;
    assert.equal(first.startMode,'plan');assert.equal(state.assignments.size,1);
    await page.waitForLoadState('networkidle');await page.reload();
    await page.getByRole('button',{name:'Reconnect this brief',exact:true}).waitFor();
    assert.ok(await page.getByLabel('Your idea',{exact:true}).getAttribute('readonly')!==null);
    state.failAssignmentReply=false;state.allowance=0;
    await page.getByRole('button',{name:'Reconnect this brief',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Robyn is exploring'}).waitFor();
    assert.deepEqual(state.requests.filter(req=>req.path==='/api/studio/assignments'&&req.method==='POST').map(req=>req.input),[first,first]);
    assert.equal(state.assignments.size,1);
    const job=state.assignments.get(first.requestId);job.state='awaiting_review';job.result='A concise illustrated guide for first-time visitors.';state.allowance=5000000;
    await page.getByRole('button',{name:'Jobs',exact:true}).click();await page.getByRole('button',{name:'Conversation',exact:true}).click();
    await page.getByRole('button',{name:'Use this plan for a first draft',exact:true}).click();
    assert.match(await page.getByLabel('Your idea',{exact:true}).inputValue(),/first-time visitors/);
    await page.getByRole('button',{name:'Make a first draft',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Robyn is taking it'}).waitFor();
    const second=[...state.assignments.values()].find(row=>row.id!==job.id);assert.equal(second.startMode,'draft');assert.notEqual(second.input.requestId,first.requestId);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('zero and unverifiable AI allowance preserve the idea and prevent both paid starting actions',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/employees`,allowance:0});await page.getByLabel('Your idea',{exact:true}).fill('A small poster.');
    await page.getByText('AI allowance needed',{exact:true}).waitFor();
    for(const name of ['Make a first draft','Help me plan'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
    state.failAllowance=true;await page.getByRole('button',{name:'Jobs',exact:true}).click();await page.getByRole('button',{name:'Conversation',exact:true}).click();
    await page.getByText('Robyn’s allowance could not be checked.',{exact:false}).waitFor();
    assert.equal(await page.getByLabel('Your idea',{exact:true}).inputValue(),'A small poster.');assert.equal(state.assignments.size,0);
  }finally{await browser.close();}
});

test('a delivered first draft appears in its project and opens from the employee page in a new tab',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page:workspace,state}=await nativeImportFixture(browser);
    const page=await openEmployeeWorkspace(workspace);await page.getByLabel('Your idea',{exact:true}).fill('A welcoming garden guide.');
    await page.getByText('$5.00 available to Robyn',{exact:true}).waitFor();await page.getByRole('button',{name:'Make a first draft',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Robyn is taking it'}).waitFor();
    const job=[...state.assignments.values()][0],assetId=randomUUID(),revisionId=randomUUID(),path='Garden guide.docx',bytes=Buffer.from('An editable first draft.');
    state.assets.set(assetId,{id:assetId,project_id:projectId,app_id:'wordcraft',name:'Garden guide',asset_kind:'native',current_revision_id:revisionId,created_at:'2026-10-26T12:00:00Z'});
    state.revisions.set(revisionId,{id:revisionId,assetId,state:'committed',revision_number:1,created_at:'2026-10-26T12:00:00Z',package:{files:[{path,role:'master',mimeType:'application/octet-stream',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}],dependencies:[]}});
    state.bytes.set(revisionId+'/'+path,bytes);job.state='awaiting_review';job.result='The first editable guide is ready.';job.deliverables=[{assetId,revisionId,name:'Garden guide',state:'committed'}];
    await page.locator('.assignment-deliverables').getByRole('button',{name:'Garden guide',exact:true}).waitFor({timeout:15000});
    const [opened]=await Promise.all([page.context().waitForEvent('page'),page.locator('.assignment-deliverables').getByRole('button',{name:'Garden guide',exact:true}).click()]);
    const editor=opened.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();assert.equal(await editor.getByLabel('Document text').inputValue(),'An editable first draft.');
    await opened.locator('.project-tabs').getByRole('button',{name:'Garden guide',exact:true}).waitFor();
    assert.ok(state.requests.some(req=>req.path===`/api/studio/revisions/${revisionId}`));assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('manual starts cover all ready Crafts, validate bytes before writes, and recover one document after reload',async()=>{
  assert.deepEqual(new Set(starters.map(item=>item.appId)),new Set(studioApps.filter(isAppReady).map(app=>app.id)));
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);state.allowance=0;state.failStarterDownload=true;
    assert.equal(await page.locator('.application-grid button').count(),studioApps.length);
    await page.locator('.application-grid button').filter({hasText:'WordCraft'}).click();
    await page.getByRole('alert').waitFor();assert.equal(state.assets.size,0);assert.equal(state.revisions.size,0);
    state.failStarterDownload=false;state.failCreationReply=true;
    await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).click();
    await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).waitFor();assert.equal(state.assets.size,1);
    await page.waitForLoadState('networkidle');await page.reload();
    state.failCommitReply=true;await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).click();
    await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).waitFor();assert.equal(state.revisions.size,1);
    await page.getByRole('button',{name:'Continue opening WordCraft',exact:true}).click();
    const editor=page.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();
    const requests=state.requests.filter(req=>req.path==='/api/studio/starters');assert.equal(requests.length,2);assert.deepEqual(requests[0].input,requests[1].input);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),`robyn-blank:${projectId}`),null);
    await editor.getByLabel('Document text').fill('A first manual edit.');
    await page.getByRole('button',{name:'New file',exact:true}).click();
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('dialog',{name:'Your applications.'}).getByRole('button',{name:'WordCraft',exact:false}).click();
    await page.keyboard.press('Escape');
    assert.equal(await editor.getByLabel('Document text').inputValue(),'A first manual edit.','cancel keeps unsaved work in the editor');
    await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
    await page.getByRole('button',{name:'New file',exact:true}).click();
    assert.equal(await page.getByRole('dialog').locator('.application-grid button').count(),studioApps.length);assert.equal(state.assignments.size,0);
    await page.waitForLoadState('networkidle');await page.goto(`${origin}/dashboard/projects/${projectId}/library`);
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Untitled document',exact:true})}).click();await page.getByRole('link',{name:'Open in WordCraft',exact:true}).click();await editor.getByText('Ready',{exact:true}).waitFor();
    assert.equal(await editor.getByLabel('Document text').inputValue(),'A first manual edit.');assert.equal(state.assets.size,1);assert.equal(state.revisions.size,2);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
