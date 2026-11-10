import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nativeImportFixture,origin,projectId,selectStudioMenuItem} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const projectPath = `/dashboard/projects/${projectId}`;
const studioItems = [['Projects','/dashboard'],['Profile','/dashboard/profile'],['Studio settings','/dashboard/settings']];
const projectItems = [['Dashboard',projectPath],['Assets',`${projectPath}/library`],['Robyn',`${projectPath}/employees`],['Settings',`${projectPath}/settings`]];
const triggerFor = page => page.getByRole('button', { name:'Robyn studio menu', exact:true });
const menuFor = page => page.getByRole('menu', { name:'Robyn studio menu', exact:true });

async function assertOpenMenu(page, active, inProject = false) {
  const menu = menuFor(page);
  await menu.waitFor();
  const expected = [...studioItems, ...(inProject ? projectItems : []), ['Visit the creative studio','/']];
  const items = menu.getByRole('menuitem');
  assert.deepEqual(await items.allTextContents(), expected.map(([name]) => name));
  const destinations = await items.evaluateAll(links => links.map(link => ({ path:new URL(link.href).pathname, target:link.target })));
  assert.deepEqual(destinations, expected.map(([,path]) => ({ path, target:'' })));
  assert.deepEqual(await menu.locator('[aria-current="page"]').allTextContents(), [active]);
  return menu;
}

async function inspectMenu(page, active, inProject) {
  await triggerFor(page).click();
  const menu = await assertOpenMenu(page, active, inProject);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state:'hidden' });
}

test('the shared Studio menu navigates in the same tab with unsaved-work protection',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:'/dashboard'});
    await inspectMenu(page,'Projects');
    await selectStudioMenuItem(page,'Studio settings');
    await page.getByLabel('Studio name',{exact:true}).waitFor();
    await selectStudioMenuItem(page,'Projects');
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'First project',exact:true})}).click();
    await page.getByRole('button',{name:'GridCraft',exact:false}).waitFor();
    assert.equal(page.context().pages().length,1);
    await inspectMenu(page,'Dashboard',true);
    assert.equal(await page.getByRole('group',{name:'Workspace tools',exact:true}).count(),0);
    assert.equal(await page.locator('.project-document-bar').count(),0);
    const headerBounds=await page.locator('.project-header').boundingBox(),canvasBounds=await page.locator('.project-start').boundingBox();
    assert.equal(canvasBounds.y,headerBounds.y+headerBounds.height);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();
    const editor=page.frameLocator('iframe[title="WordCraft editor"]');await editor.getByText('Ready',{exact:true}).waitFor();
    await editor.getByLabel('Document text').fill('Keep this unsaved draft open.');
    await page.locator('.project-save-state[data-state="dirty"]').waitFor();
    assert.equal(await page.getByRole('group',{name:'Workspace tools',exact:true}).count(),0);
    assert.equal(await page.locator('.project-document-tools').getByRole('button',{name:'New file',exact:true}).isVisible(),true);
    assert.equal((await page.locator('iframe').boundingBox()).y,88);
    await triggerFor(page).click();
    const menu = await assertOpenMenu(page,'Dashboard',true);
    const selectedAsset = [...state.assets.values()][0];
    const robynLink = new URL(await menu.getByRole('menuitem',{name:'Robyn',exact:true}).getAttribute('href'), origin);
    assert.equal(robynLink.searchParams.get('asset'),selectedAsset.id);
    assert.equal(robynLink.searchParams.get('revision'),selectedAsset.current_revision_id);
    page.once('dialog',dialog=>dialog.dismiss());
    await menu.getByRole('menuitem',{name:'Dashboard',exact:true}).click();
    await page.keyboard.press('Escape');
    await menu.waitFor({state:'hidden'});
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep this unsaved draft open.');
    let blocked=false;page.once('dialog',async dialog=>{blocked=true;assert.match(dialog.message(),/unsaved work/);await dialog.dismiss();});
    await selectStudioMenuItem(page,'Assets');
    await page.keyboard.press('Escape');
    await menu.waitFor({state:'hidden'});
    assert.equal(blocked,true);assert.equal(new URL(page.url()).pathname,projectPath);
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep this unsaved draft open.');
    await editor.getByRole('button',{name:'Save document',exact:true}).click();await editor.getByText('Saved',{exact:true}).waitFor();
    await selectStudioMenuItem(page,'Dashboard');
    await page.getByRole('button',{name:'WordCraft',exact:false}).waitFor();
    assert.equal(await page.locator('iframe').count(),0);assert.equal(new URL(page.url()).searchParams.has('asset'),false);
    await selectStudioMenuItem(page,'Assets');
    const tools=page;
    await tools.getByRole('heading',{name:'Assets.',exact:true}).waitFor();
    await inspectMenu(page,'Assets',true);
    assert.equal(await tools.getByLabel('Filter by project').count(),0);
    await selectStudioMenuItem(tools,'Robyn');
    await tools.getByLabel('Your idea',{exact:true}).waitFor();
    await inspectMenu(page,'Robyn',true);
    assert.equal(await tools.getByLabel('Employee project').count(),0);
    await tools.getByRole('link',{name:'Robyn’s browser ↗',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'Robyn has control'}).waitFor();
    await inspectMenu(page,'Robyn',true);
    const poll=tools.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/studio/research/browser');
    await tools.getByRole('button',{name:'Take over',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'You have control'}).waitFor();
    await tools.getByRole('button',{name:'Return control',exact:true}).click();
    await tools.getByRole('status').filter({hasText:'Robyn has control'}).waitFor();await poll;
    assert.equal(await tools.getByRole('link',{name:'Robyn’s jobs',exact:false}).getAttribute('href'),`/dashboard/projects/${projectId}/employees?view=jobs`);
    const requests=state.requests.filter(row=>['/api/studio/research/browser','/api/studio/assets','/api/studio/assignments'].includes(row.path));
    assert.ok(requests.length>4);assert.ok(requests.every(row=>new URLSearchParams(row.search).get('projectId')===projectId));
    const controls=requests.filter(row=>['take','return'].includes(row.input?.action));assert.equal(controls.length,2);assert.equal(controls[0].input.controlId,controls[1].input.controlId);
    await selectStudioMenuItem(tools,'Settings');
    await tools.getByLabel('Studio name',{exact:true}).waitFor();
    await inspectMenu(page,'Settings',true);
    for(const width of [1440,1200]){
      await tools.setViewportSize({width,height:960});
      assert.equal(await tools.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await inspectMenu(page,'Settings',true);
    }
    await selectStudioMenuItem(tools,'Robyn');
    await tools.getByLabel('Your idea',{exact:true}).waitFor();
    assert.equal(await tools.getByRole('link',{name:'Manage AI allowance',exact:true}).getAttribute('href'),`/dashboard/projects/${projectId}/settings#studio-budget`);
    assert.equal(state.assignments.size,0);
    assert.equal(page.context().pages().length,1);assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('Studio and project pages share one keyboard-accessible menu in the same header position',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'WordCraft',exact:false}).click();
    await page.frameLocator('iframe[title="WordCraft editor"]').getByText('Ready',{exact:true}).waitFor();
    const asset=[...state.assets.values()][0];
    state.project.name='A long project title that should truncate without moving any of the main menu items '.repeat(2);
    const pages = [...studioItems, ...projectItems, ['Assets',`${projectPath}/library/${asset.id}`]];
    for(const width of [1200,1440]){
      await page.setViewportSize({width,height:960});
      let position;
      for(const [active,path] of pages){
        const inProject = path.startsWith(projectPath);
        await page.goto(origin+path);
        if(inProject)await page.waitForFunction(name=>document.querySelector('.project-header-name')?.textContent===name,state.project.name);
        await page.evaluate(()=>document.fonts.ready);
        const header = page.locator('.studio-header');
        const trigger = triggerFor(page);
        await trigger.waitFor();
        assert.equal(await header.count(),1);
        assert.equal(await header.getByRole('button',{name:'Robyn studio menu',exact:true}).count(),1);
        assert.equal(await header.getByRole('navigation').count(),0);
        assert.equal(await header.getByRole('link',{name:/^(Projects|Profile|Studio settings|Dashboard|Assets|Robyn|Settings)$/}).count(),0);
        const current = await trigger.boundingBox();
        if(position)assert.deepEqual(current,position);else position=current;
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.ok(current.x>=0&&current.x+current.width<=width);
        if(inProject){
          const nameBounds=await header.locator('.project-header-name').boundingBox();
          assert.ok(nameBounds.x>=current.x+current.width&&nameBounds.x+nameBounds.width<=width);
        }
        const scan=await new AxeBuilder({page}).include('.studio-header').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
        assert.deepEqual(scan.violations.map(violation=>({id:violation.id,targets:violation.nodes.map(node=>node.target)})),[]);
        await trigger.focus();await page.keyboard.press('Enter');
        const menu = await assertOpenMenu(page,active,inProject);
        await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
        await trigger.and(page.locator(':focus')).waitFor();
      }
    }
    await triggerFor(page).focus();await page.keyboard.press('Enter');
    await menuFor(page).getByRole('menuitem',{name:'Dashboard',exact:true}).focus();
    await page.keyboard.press('Enter');await page.getByRole('button',{name:'WordCraft',exact:false}).waitFor();
    assert.equal(new URL(page.url()).pathname,projectPath);
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
