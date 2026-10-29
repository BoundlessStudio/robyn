import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nativeImportFixture,projectId} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];

test('Settings saves project details, retains activity and archives or reactivates the same project',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    const otherId=randomUUID();state.projects.set(otherId,{...state.project,id:otherId,name:'Another project',brief:'Keep this brief.'});
    state.activity.push({id:randomUUID(),kind:'revision.committed',created_at:state.project.created_at,details:{}});
    await page.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Settings',exact:true}).click();
    await page.getByRole('heading',{name:'Project details',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Project activity',exact:true}).waitFor();
    await page.getByText('A new revision was saved',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Studio name',{exact:true}).isVisible(),true);
    await page.getByLabel('Project name',{exact:true}).fill('Autumn launch');
    await page.getByRole('textbox',{name:'Project brief',exact:true}).fill('Warm colours. A film and a poster for the exhibition.');
    await page.getByRole('button',{name:'Save project details',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Project details saved.'}).waitFor();
    await page.locator('.project-header-name').getByRole('link',{name:'Autumn launch',exact:true}).waitFor();
    assert.equal(state.project.name,'Autumn launch');assert.equal(state.project.brief,'Warm colours. A film and a poster for the exhibition.');
    assert.equal(state.projects.get(otherId).brief,'Keep this brief.');
    assert.deepEqual(state.requests.filter(row=>row.method==='PATCH').map(row=>({path:row.path,input:row.input})),[
      {path:`/api/studio/projects/${projectId}`,input:{name:'Autumn launch',brief:state.project.brief}},
    ]);
    await page.reload();
    await page.getByRole('heading',{name:'Project details',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Project name',{exact:true}).inputValue(),'Autumn launch');
    assert.equal(await page.getByRole('textbox',{name:'Project brief',exact:true}).inputValue(),state.project.brief);
    const scan=await new AxeBuilder({page}).include('#project-details').analyze();
    assert.deepEqual(scan.violations.map(row=>({id:row.id,targets:row.nodes.map(node=>node.target)})),[]);
    // A rejected archive keeps both the active project and unsaved form values.
    await page.getByRole('textbox',{name:'Project brief',exact:true}).fill('Keep this unsaved refinement.');
    await page.route(`**/api/studio/projects/${projectId}`,route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:{message:'Project update unavailable.'}}}):route.fallback());
    await page.getByRole('button',{name:'Archive project',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Project update unavailable.'}).waitFor();
    assert.equal(state.project.status,'active');
    assert.equal(await page.getByRole('textbox',{name:'Project brief',exact:true}).inputValue(),'Keep this unsaved refinement.');
    await page.unroute(`**/api/studio/projects/${projectId}`);
    await page.getByRole('button',{name:'Archive project',exact:true}).click();
    await page.getByRole('button',{name:'Reactivate project',exact:true}).waitFor();
    await page.locator('.project-header .project-archive-label').waitFor();
    assert.equal(state.project.status,'archived');
    assert.equal(await page.getByRole('textbox',{name:'Project brief',exact:true}).inputValue(),'Keep this unsaved refinement.');
    assert.equal(state.project.brief,'Warm colours. A film and a poster for the exhibition.');
    await page.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Dashboard',exact:true}).click();
    await page.getByRole('button',{name:'WordCraft',exact:false}).waitFor();
    await page.locator('.project-header .project-archive-label').waitFor();
    assert.equal(await page.getByRole('button',{name:'WordCraft',exact:false}).isDisabled(),true);
    await page.locator('.studio-note').getByRole('link',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Reactivate project',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Project reactivated.'}).waitFor();
    assert.equal(await page.locator('.project-header .project-archive-label').count(),0);
    assert.equal(state.project.status,'active');
    await page.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Dashboard',exact:true}).click();
    await page.getByRole('button',{name:'WordCraft',exact:false,disabled:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'WordCraft',exact:false}).isEnabled(),true);
    assert.ok(state.requests.filter(row=>row.method==='PATCH').every(row=>row.path===`/api/studio/projects/${projectId}`));
    assert.equal(state.assignments.size,0);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
