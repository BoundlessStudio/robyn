import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const menuNames=['Dashboard','Assets','AI Employees','Research','Settings'];
const menuPaths=['','/library','/employees','/research','/settings'];

async function assertProjectMenu(page,active){
  const navigation=page.getByRole('navigation',{name:'Project navigation',exact:true});
  await navigation.waitFor();
  assert.deepEqual(await navigation.getByRole('link').allTextContents(),menuNames);
  assert.deepEqual(await navigation.locator('[aria-current="page"]').allTextContents(),[active]);
  const destinations=await navigation.getByRole('link').evaluateAll(links=>links.map(link=>({path:new URL(link.href).pathname,target:link.target})));
  assert.deepEqual(destinations,menuPaths.map(section=>({path:`/dashboard/projects/${projectId}${section}`,target:''})));
  assert.equal(await navigation.getByRole('button').count(),0);
}

test('the standard project menu navigates in the same tab with unsaved-work protection',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:'/dashboard'});
    const navigation=page.getByRole('navigation',{name:'Studio navigation'});
    await navigation.waitFor();
    for(const name of menuNames)assert.equal(await navigation.getByRole('link',{name,exact:true}).count(),0);
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'First project',exact:true})}).click();
    await page.getByRole('button',{name:'Robyn studio menu',exact:true}).click();
    for(const name of menuNames){
      const item=page.getByRole('menuitem',{name,exact:true});
      assert.equal(new URL(await item.getAttribute('href'),origin).pathname,`/dashboard/projects/${projectId}${menuPaths[menuNames.indexOf(name)]}`);assert.equal(await item.getAttribute('target'),null);
    }
    assert.equal(await page.getByRole('menuitem',{name:'Applications',exact:true}).count(),0);
    await page.getByRole('menuitem',{name:'Dashboard',exact:true}).click();
    await page.getByRole('button',{name:'GridCraft',exact:false}).waitFor();
    assert.equal(page.context().pages().length,1);
    const header=page.getByRole('navigation',{name:'Project navigation',exact:true});
    await header.getByRole('link',{name:'Assets',exact:true}).waitFor();
    await assertProjectMenu(page,'Dashboard');
    assert.equal(await page.getByRole('group',{name:'Workspace tools',exact:true}).count(),0);
    assert.equal(await page.locator('.project-document-bar').count(),0);
    const headerBounds=await page.locator('.project-header').boundingBox(),canvasBounds=await page.locator('.project-start').boundingBox();
    assert.equal(canvasBounds.y,headerBounds.y+headerBounds.height);
    for(const target of await header.locator('a').evaluateAll(links=>links.map(link=>link.target)))assert.equal(target,'');
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();
    const editor=page.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();
    await editor.getByLabel('Document text').fill('Keep this unsaved draft open.');
    await page.locator('.project-save-state[data-state="dirty"]').waitFor();
    await assertProjectMenu(page,'Dashboard');
    assert.equal(await page.getByRole('group',{name:'Workspace tools',exact:true}).count(),0);
    assert.equal(await page.locator('.project-document-tools').getByRole('button',{name:'New file',exact:true}).isVisible(),true);
    assert.equal((await page.locator('iframe').boundingBox()).y,88);
    page.once('dialog',dialog=>dialog.dismiss());
    await header.getByRole('link',{name:'Dashboard',exact:true}).click();
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep this unsaved draft open.');
    let blocked=false;page.once('dialog',async dialog=>{blocked=true;assert.match(dialog.message(),/unsaved work/);await dialog.dismiss();});
    await header.getByRole('link',{name:'Assets',exact:true}).click();
    assert.equal(blocked,true);assert.equal(new URL(page.url()).pathname,`/dashboard/projects/${projectId}`);
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep this unsaved draft open.');
    await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
    await header.getByRole('link',{name:'Dashboard',exact:true}).click();
    await page.getByRole('button',{name:'WordCraft',exact:false}).waitFor();
    assert.equal(await page.locator('iframe').count(),0);assert.equal(new URL(page.url()).searchParams.has('asset'),false);
    await header.getByRole('link',{name:'Assets',exact:true}).click();
    const tools=page;
    await tools.getByRole('heading',{name:'Assets.',exact:true}).waitFor();
    await assertProjectMenu(page,'Assets');
    assert.equal(await tools.getByLabel('Filter by project').count(),0);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'AI Employees',exact:true}).click();
    await tools.getByLabel('Your idea',{exact:true}).waitFor();
    await assertProjectMenu(page,'AI Employees');
    assert.equal(await tools.getByLabel('Employee project').count(),0);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Research',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'Research has control'}).waitFor();
    await assertProjectMenu(page,'Research');
    const poll=tools.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/studio/research/browser');
    await tools.getByRole('button',{name:'Take over',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'You have control'}).waitFor();
    await tools.getByRole('button',{name:'Return control',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'Research has control'}).waitFor();await poll;
    assert.equal(await tools.getByRole('link',{name:'Project briefs',exact:false}).getAttribute('href'),`/dashboard/projects/${projectId}/employees?view=assignments`);
    const requests=state.requests.filter(row=>['/api/studio/research/browser','/api/studio/assets','/api/studio/assignments'].includes(row.path));
    assert.ok(requests.length>4);assert.ok(requests.every(row=>new URLSearchParams(row.search).get('projectId')===projectId));
    const controls=requests.filter(row=>['take','return'].includes(row.input?.action));assert.equal(controls.length,2);assert.equal(controls[0].input.controlId,controls[1].input.controlId);
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Settings',exact:true}).click();
    await tools.getByLabel('Studio name',{exact:true}).waitFor();
    await assertProjectMenu(page,'Settings');
    for(const width of [1440,1200]){
      await tools.setViewportSize({width,height:960});
      assert.equal(await tools.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await assertProjectMenu(page,'Settings');
    }
    await tools.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'AI Employees',exact:true}).click();
    await tools.getByLabel('Your idea',{exact:true}).waitFor();
    assert.equal(await tools.getByRole('link',{name:'Manage AI budget',exact:false}).getAttribute('href'),`/dashboard/projects/${projectId}/settings#studio-budget`);
    assert.equal(state.assignments.size,0);
    assert.equal(page.context().pages().length,1);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('every project section and asset detail keeps menu positions, active state and keyboard navigation at desktop widths',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();
    await page.frameLocator('iframe[title="WordCraft editor"]').getByText('Ready',{exact:true}).waitFor();
    const asset=[...state.assets.values()][0];
    state.project.name='A long project title that should truncate without moving any of the main menu items '.repeat(2);
    for(const width of [1200,1440]){
      await page.setViewportSize({width,height:960});
      let positions;
      for(const [section,active] of [...menuPaths.map((path,index)=>[path,menuNames[index]]),[`/library/${asset.id}`,'Assets']]){
        await page.goto(`${origin}/dashboard/projects/${projectId}${section}`);
        await page.waitForFunction(name=>document.querySelector('.project-header-name')?.textContent===name,state.project.name);
        await page.evaluate(()=>document.fonts.ready);
        await assertProjectMenu(page,active);
        const current=await page.getByRole('navigation',{name:'Project navigation'}).getByRole('link').evaluateAll(links=>links.map(link=>{
          const rect=link.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};
        }));
        if(positions)assert.deepEqual(current,positions);else positions=current;
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.ok(current.every(rect=>rect.x>=0&&rect.x+rect.width<=width));
        const nameBounds=await page.locator('.project-header-name').boundingBox();assert.ok(nameBounds.x+nameBounds.width<=current[0].x);
        const scan=await new AxeBuilder({page}).include('.project-header').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
        assert.deepEqual(scan.violations.map(violation=>({id:violation.id,targets:violation.nodes.map(node=>node.target)})),[]);
        const trigger=page.getByRole('button',{name:'Robyn studio menu',exact:true});
        await trigger.focus();await page.keyboard.press('Enter');
        const menu=page.getByRole('menu');await menu.waitFor();
        assert.deepEqual((await menu.getByRole('menuitem').allTextContents()).slice(1,-1),menuNames);
        assert.deepEqual(await menu.locator('[aria-current="page"]').allTextContents(),[active]);
        await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
        await page.locator('.studio-project-menu:focus').waitFor();
        assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
      }
    }
    await page.getByRole('navigation',{name:'Project navigation'}).getByRole('link',{name:'Dashboard',exact:true}).focus();
    await page.keyboard.press('Enter');await page.getByRole('button',{name:'WordCraft',exact:false}).waitFor();
    assert.equal(new URL(page.url()).pathname,`/dashboard/projects/${projectId}`);
    assert.equal(state.assignments.size,0);assert.equal(page.context().pages().length,1);assert.deepEqual(state.errors,[]);
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
    for(const section of ['library','employees','research','settings']){
      const count=state.requests.length;
      await page.goto(`${origin}/dashboard/projects/${randomUUID()}/${section}`);
      await page.getByRole('alert').filter({hasText:'Project not found.'}).waitFor();
      assert.ok(state.requests.slice(count).every(row=>row.path.startsWith('/api/studio/projects/')));
    }
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
