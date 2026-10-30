import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nativeImportFixture,openEmployeeWorkspace,origin,projectId} from './fixtures/native-import.mjs';
import {studioTools} from '../src/studio/tools.ts';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];

test('AI Employees stays in the same tab and keeps the exact saved revision after protecting unsaved work',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page:workspace,state}=await nativeImportFixture(browser);
    await workspace.getByRole('button',{name:'WordCraft',exact:false}).click();
    const editor=workspace.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();
    const source=await workspace.locator('iframe').getAttribute('src'),asset=[...state.assets.values()][0];
    await editor.getByLabel('Document text').fill('Save these words before opening the team page.');
    await workspace.locator('.project-save-state[data-state="dirty"]').waitFor();
    workspace.once('dialog',dialog=>dialog.dismiss());
    await workspace.locator('.project-header').getByRole('link',{name:'AI Employees',exact:true}).click();
    assert.equal(await workspace.locator('iframe').getAttribute('src'),source);assert.equal(await editor.getByLabel('Document text').inputValue(),'Save these words before opening the team page.');
    await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
    const revisionId=asset.current_revision_id;
    const page=await openEmployeeWorkspace(workspace);
    await page.getByRole('button',{name:'Open saved revision',exact:true}).waitFor();
    const url=new URL(page.url());assert.equal(url.pathname,`/dashboard/projects/${projectId}/employees`);assert.equal(url.searchParams.has('projectId'),false);assert.equal(url.searchParams.get('asset'),asset.id);assert.equal(url.searchParams.get('revision'),revisionId);
    assert.equal(await page.locator('iframe').count(),0);assert.equal(await workspace.locator('.project-details').count(),0);
    assert.equal(page,workspace);assert.equal(page.context().pages().length,1);
    await page.getByLabel('Your idea',{exact:true}).fill('Continue from this saved version.');
    await page.getByRole('button',{name:'Make a first draft',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Your Director is taking it'}).waitFor();
    assert.deepEqual([...state.assignments.values()][0].input.inputs,[{assetId:asset.id,revisionId}]);
    assert.equal(state.revisions.size,2);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('Research continues from its clean saved notebook on the employee assignments page',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page:workspace,state}=await nativeImportFixture(browser);
    const assetId=randomUUID(),revisionId=randomUUID(),path='Field notes.md',bytes=Buffer.from('# Garden references\n\nA saved starting point.');
    state.assets.set(assetId,{id:assetId,project_id:projectId,app_id:'research',name:'Field notes',asset_kind:'native',current_revision_id:revisionId,created_at:state.project.created_at});
    state.revisions.set(revisionId,{id:revisionId,assetId,state:'committed',revision_number:1,package:{files:[{path,role:'master',mimeType:'text/markdown',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}],dependencies:[]}});state.bytes.set(revisionId+'/'+path,bytes);
    await workspace.goto(`${origin}/dashboard/projects/${projectId}?asset=${assetId}&revision=${revisionId}`);
    await workspace.getByRole('button',{name:'Edit notebook',exact:true}).click();
    await workspace.getByLabel('Notebook Markdown').fill('# Garden references\n\nA human note to continue.');
    const handoff=workspace.getByRole('button',{name:'Continue with Research ↗',exact:true});assert.equal(await handoff.isDisabled(),true);
    await workspace.getByRole('button',{name:'Save revision',exact:true}).click();
    await workspace.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Continue with Research ↗')?.disabled);
    const [page]=await Promise.all([workspace.context().waitForEvent('page'),handoff.click()]);
    await page.getByLabel('Who is this for?').waitFor();await page.waitForFunction(()=>document.querySelector('.assignment-composer select')?.selectedOptions[0]?.textContent==='Research');
    const url=new URL(page.url());assert.equal(url.searchParams.get('view'),'assignments');assert.equal(url.searchParams.get('asset'),assetId);assert.equal(url.searchParams.get('revision'),state.assets.get(assetId).current_revision_id);assert.notEqual(url.searchParams.get('revision'),revisionId);
    assert.equal(await workspace.getByLabel('Notebook Markdown').inputValue(),'# Garden references\n\nA human note to continue.');assert.equal(state.assignments.size,0);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('project routes scope briefs and assignments; all four views remain usable without automatic AI work',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/employees`});
    await page.getByLabel('Your idea',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Employee project').count(),0);
    assert.equal(state.assignments.size,0);
    const second=randomUUID();state.projects.set(second,{...state.project,id:second,name:'Second project'});
    await page.getByLabel('Your idea',{exact:true}).waitFor();
    await page.getByLabel('Your idea',{exact:true}).fill('A brief for the first project.');
    await page.goto(`${origin}/dashboard/projects/${second}/employees`);
    await page.getByLabel('Your idea',{exact:true}).waitFor();assert.equal(await page.getByLabel('Your idea',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Assignments',exact:true}).click();await page.getByLabel('The brief',{exact:true}).fill('Ask Research about the second project.');
    const employees=page.getByLabel('Who is this for?');await employees.selectOption({label:'Research'});
    await page.getByRole('button',{name:'Send the brief',exact:true}).click();await page.getByRole('status').filter({hasText:'Your brief is in the studio.'}).waitFor();
    const job=[...state.assignments.values()][0];assert.equal(job.input.projectId,second);assert.equal(job.appId,'research');
    await page.getByRole('button',{name:'Review',exact:true}).click();await page.getByText('Finished work will arrive here.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByRole('heading',{name:'Creative Director',exact:true}).waitFor();assert.equal(await page.locator('.studio-app-card').count(),studioTools.length+1);
    const solid=page.locator('.studio-app-card').filter({hasText:'SolidCraft'});assert.equal(await solid.count(),1);await solid.getByText('Parametric 3D Designer',{exact:true}).waitFor();await solid.getByText('Ready for your first brief',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('view'),'team');await page.reload();await page.getByRole('heading',{name:'Creative Director',exact:true}).waitFor();
    await page.goto(`${origin}/dashboard/projects/${projectId}/employees`);
    await page.waitForFunction(()=>document.querySelector('textarea')?.value==='A brief for the first project.');
    await page.getByRole('button',{name:'Assignments',exact:true}).click();await page.getByText('The next idea starts here.',{exact:false}).waitFor();
    assert.ok(state.requests.filter(row=>row.path==='/api/studio/assignments'&&row.method==='GET').every(row=>[projectId,second].includes(new URLSearchParams(row.search).get('projectId'))));
    assert.equal(state.assignments.size,1);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('the employee review page opens the exact deliverable and records the review',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/employees?view=review`});
    const id=randomUUID(),assetId=randomUUID(),revisionId=randomUUID();
    state.assignments.set(id,{id,input:{projectId},role:'Creative Director',appId:null,state:'awaiting_review',brief:'Review this saved draft.',result:'Ready for a closer look.',deliverables:[{assetId,revisionId,name:'Saved first draft',state:'committed'}]});
    await page.reload();await page.getByRole('button',{name:'Saved first draft',exact:true}).waitFor();
    await page.context().route('**/dashboard/projects/**',route=>route.fulfill({contentType:'text/html',body:'<p>Opened saved work</p>'}));
    const [opened]=await Promise.all([page.context().waitForEvent('page'),page.getByRole('button',{name:'Saved first draft',exact:true}).click()]);
    await opened.waitForLoadState();const url=new URL(opened.url());assert.equal(url.searchParams.get('asset'),assetId);assert.equal(url.searchParams.get('revision'),revisionId);await opened.close();
    await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('status').filter({hasText:'Approved.'}).waitFor();
    assert.equal(state.assignments.get(id).reviewDecision,'approved');assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('invalid saved-file context blocks a brief until removed, and archived projects cannot send work',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/employees?asset=invalid&revision=invalid`});
    await page.getByRole('alert').filter({hasText:'Invalid asset ID.'}).waitFor();assert.equal(await page.getByLabel('Your idea',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Continue without the included file',exact:true}).click();await page.getByLabel('Your idea',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.has('asset'),false);
    state.project.status='archived';await page.reload();await page.getByText('This project is archived.',{exact:false}).waitFor();
    await page.getByLabel('Your idea',{exact:true}).fill('Keep this idea for later.');
    for(const name of ['Make a first draft','Help me plan'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
    assert.equal(state.assignments.size,0);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('employee page controls fit the supported desktop widths and pass accessibility checks',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/employees`});
    await page.getByLabel('Your idea',{exact:true}).waitFor();
    for(const width of [1440,1200]){
      await page.setViewportSize({width,height:960});
      for(const view of ['Conversation','Assignments','Review','Team']){
        await page.getByRole('button',{name:view,exact:true}).click();
        if(view==='Team')await page.getByRole('heading',{name:'Creative Director',exact:true}).waitFor();
        else await page.locator('.assignment-list').waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const report=await new AxeBuilder({page}).include('.studio-main').analyze();assert.deepEqual(report.violations.map(row=>({id:row.id,nodes:row.nodes.map(node=>node.target)})),[]);
      }
    }
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
