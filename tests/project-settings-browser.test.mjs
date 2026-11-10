import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import {nativeImportFixture,origin,projectId,selectStudioMenuItem} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];

test('Settings saves project details, hides activity and archives or reactivates the same project',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    const otherId=randomUUID();state.projects.set(otherId,{...state.project,id:otherId,name:'Another project',brief:'Keep this brief.'});
    state.activity.push({id:randomUUID(),kind:'revision.committed',created_at:state.project.created_at,details:{}});
    await selectStudioMenuItem(page,'Project settings');
    await page.getByRole('heading',{name:'Project settings.',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Project details',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Project activity',exact:true,includeHidden:true}).count(),0);
    assert.equal(await page.getByText('A new revision was saved',{exact:true}).count(),0);
    assert.equal(state.activity.length,1);
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
    await selectStudioMenuItem(page,'Dashboard');
    await page.getByRole('button',{name:'WordCraft',exact:false}).waitFor();
    await page.locator('.project-header .project-archive-label').waitFor();
    assert.equal(await page.getByRole('button',{name:'WordCraft',exact:false}).isDisabled(),true);
    await page.locator('.studio-note').getByRole('link',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Reactivate project',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Project reactivated.'}).waitFor();
    assert.equal(await page.locator('.project-header .project-archive-label').count(),0);
    assert.equal(state.project.status,'active');
    await selectStudioMenuItem(page,'Dashboard');
    await page.getByRole('button',{name:'WordCraft',exact:false,disabled:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'WordCraft',exact:false}).isEnabled(),true);
    assert.ok(state.requests.filter(row=>row.method==='PATCH').every(row=>row.path===`/api/studio/projects/${projectId}`));
    assert.equal(state.assignments.size,0);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('External MCP presents the ChatGPT fields in order and copies or downloads each separately',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/settings#external-mcp`});
    await page.waitForURL(`${origin}/dashboard/settings#external-mcp`);
    const setup=page.getByRole('region',{name:'External MCP',exact:true});
    await setup.getByRole('heading',{name:'Connect in ChatGPT'}).waitFor();
    assert.deepEqual(await setup.getByRole('heading',{level:4}).allTextContents(),[
      'Icon (optional)','Name','Description (optional)','Connection','Authentication',
    ]);
    await page.evaluate(()=>{
      window.copiedFields=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedFields.push(value);}}});
    });
    const description=await setup.getByRole('heading',{name:'Description (optional)',exact:true}).locator('..').locator('.studio-mcp-value').textContent();
    assert.ok(description?.trim());
    const copyActions=[['Copy name','Robyn'],['Copy description',description],['Copy server URL','https://studio.example.test/mcp']];
    for(const [action] of copyActions){
      const button=setup.getByRole('button',{name:action,exact:true});
      await button.click();
      await button.locator('..').getByRole('status').filter({hasText:'Copied to clipboard.'}).waitFor();
    }
    assert.deepEqual(await page.evaluate(()=>window.copiedFields),copyActions.map(([,value])=>value));
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});
    const urlCopy=setup.getByRole('button',{name:'Copy server URL',exact:true});
    await urlCopy.click();
    await urlCopy.locator('..').getByRole('status').filter({hasText:'Select and copy the value above.'}).waitFor();

    const iconLink=setup.getByRole('link',{name:'Download icon',exact:true});
    assert.notEqual(await iconLink.getAttribute('download'),null);
    const iconResponse=await iconLink.evaluate(async link=>{
      const response=await fetch(link.href);
      return {contentType:response.headers.get('content-type'),bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};
    });
    assert.equal(iconResponse.contentType,'image/png');
    const icon=Buffer.from(iconResponse.bytes);
    const {format,width,height}=await sharp(icon).metadata();
    assert.deepEqual({format,width,height},{format:'png',width:256,height:256});
    assert.ok(icon.length<=10_000);

    await setup.getByText('Advanced OAuth settings',{exact:true}).click();
    await setup.getByText('Dynamic Client Registration',{exact:true}).waitFor();
    const scan=await new AxeBuilder({page}).include('#external-mcp').analyze();
    assert.deepEqual(scan.violations.map(row=>({id:row.id,targets:row.nodes.map(node=>node.target)})),[]);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
