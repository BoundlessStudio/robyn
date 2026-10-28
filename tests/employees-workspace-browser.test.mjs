import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nativeImportFixture,openEmployeeWorkspace,origin,projectId} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];

test('AI Employees opens a project and exact saved revision on its own page while unsaved editing continues',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page:workspace,state}=await nativeImportFixture(browser);
    await workspace.getByRole('button',{name:'WordCraft',exact:false}).click();
    const editor=workspace.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();
    const source=await workspace.locator('iframe').getAttribute('src'),asset=[...state.assets.values()][0],revisionId=asset.current_revision_id;
    await editor.getByLabel('Document text').fill('Keep writing while the team page is open.');
    const page=await openEmployeeWorkspace(workspace);
    await page.getByRole('button',{name:'Open saved revision',exact:true}).waitFor();
    const url=new URL(page.url());assert.equal(url.pathname,'/dashboard/employees');assert.equal(url.searchParams.get('projectId'),projectId);assert.equal(url.searchParams.get('asset'),asset.id);assert.equal(url.searchParams.get('revision'),revisionId);
    assert.equal(await page.locator('iframe').count(),0);assert.equal(await workspace.locator('.project-details').count(),0);
    assert.equal(await workspace.locator('iframe').getAttribute('src'),source);assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep writing while the team page is open.');
    await page.getByLabel('Your idea',{exact:true}).fill('Continue from this saved version.');
    await page.getByRole('button',{name:'Make a first draft',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Your Director is taking it'}).waitFor();
    assert.deepEqual([...state.assignments.values()][0].input.inputs,[{assetId:asset.id,revisionId}]);
    await page.close();await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
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

test('project selection scopes briefs and assignments; all four views remain usable without automatic AI work',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:'/dashboard/employees'});
    await page.getByRole('heading',{name:'A shared place for your next idea.',exact:true}).waitFor();
    assert.equal(state.requests.some(row=>row.path==='/api/studio/assignments'),false);
    const second=randomUUID();state.projects.set(second,{...state.project,id:second,name:'Second project'});
    await page.reload();await page.getByLabel('Employee project').selectOption(projectId);
    await page.getByLabel('Your idea',{exact:true}).fill('A brief for the first project.');
    await page.getByLabel('Employee project').selectOption(second);
    await page.getByLabel('Your idea',{exact:true}).waitFor();assert.equal(await page.getByLabel('Your idea',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Assignments',exact:true}).click();await page.getByLabel('The brief',{exact:true}).fill('Ask Research about the second project.');
    const employees=page.getByLabel('Who is this for?');await employees.selectOption({label:'Research'});
    await page.getByRole('button',{name:'Send the brief',exact:true}).click();await page.getByRole('status').filter({hasText:'Your brief is in the studio.'}).waitFor();
    const job=[...state.assignments.values()][0];assert.equal(job.input.projectId,second);assert.equal(job.appId,'research');
    await page.getByRole('button',{name:'Review',exact:true}).click();await page.getByText('Finished work will arrive here.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByRole('heading',{name:'Creative Director',exact:true}).waitFor();assert.equal(await page.locator('.studio-app-card').count(),15);
    assert.equal(new URL(page.url()).searchParams.get('view'),'team');await page.reload();await page.getByRole('heading',{name:'Creative Director',exact:true}).waitFor();
    await page.getByRole('button',{name:'Conversation',exact:true}).click();await page.getByLabel('Employee project').selectOption(projectId);
    await page.waitForFunction(()=>document.querySelector('textarea')?.value==='A brief for the first project.');
    await page.getByRole('button',{name:'Assignments',exact:true}).click();await page.getByText('The next idea starts here.',{exact:false}).waitFor();
    assert.equal(state.assignments.size,1);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('the employee review page opens the exact deliverable and records the review',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/employees?projectId=${projectId}&view=review`});
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
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/employees?projectId=${projectId}&asset=invalid&revision=invalid`});
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
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/employees?projectId=${projectId}`});
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
