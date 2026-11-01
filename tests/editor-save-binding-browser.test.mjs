import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {nativeImportFixture,dropDocument,projectId} from './fixtures/native-import.mjs';

test('confirmed Save As binds its reload URL before project refresh and keeps later saves and copies on the live editor',async()=>{
  const browser=await chromium.launch({headless:true});
  let releaseRefresh;
  try{
    const {page,state}=await nativeImportFixture(browser);
    await dropDocument(page,'Brief.docx','Original transport fixture');
    const editor=page.frameLocator('iframe');
    await editor.getByText('Ready',{exact:true}).waitFor();
    await page.waitForLoadState('networkidle');
    const original=[...state.assets.values()][0],iframe=await page.locator('iframe').elementHandle();
    let held=false;
    await page.route(`**/api/studio/projects/${projectId}`,async route=>{
      if(!held&&[...state.assets.values()].some(asset=>asset.id!==original.id&&asset.current_revision_id)){
        held=true;await new Promise(resolve=>{releaseRefresh=resolve;});
      }
      await route.fallback();
    });
    await editor.getByRole('button',{name:'Save as another asset'}).click();
    await editor.getByText('Saved as another asset',{exact:true}).waitFor();
    const adopted=[...state.assets.values()].find(asset=>asset.name==='Another direction');
    assert.equal(held,true);
    assert.equal(new URL(page.url()).searchParams.get('asset'),adopted.id);
    assert.equal(new URL(page.url()).searchParams.get('revision'),adopted.current_revision_id);
    assert.equal(await iframe.evaluate(element=>element.isConnected),true);
    await editor.getByRole('button',{name:'Save a copy',exact:true}).click();
    await editor.getByText('Copy saved',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('asset'),adopted.id);
    await editor.getByLabel('Document text').fill('Later confirmed edit');
    await editor.getByRole('button',{name:'Save document',exact:true}).click();
    await editor.getByText('Saved',{exact:true}).waitFor();
    const latest=adopted.current_revision_id;
    assert.equal(new URL(page.url()).searchParams.get('revision'),latest);
    releaseRefresh();releaseRefresh=null;
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).searchParams.get('revision'),latest,'an older refresh cannot restore its earlier revision');
    assert.equal(await iframe.evaluate(element=>element.isConnected),true);
    await page.reload();
    await editor.getByText('Ready',{exact:true}).waitFor();
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Later confirmed edit');
    assert.deepEqual(state.errors,[]);
  }finally{releaseRefresh?.();await browser.close();}
});
