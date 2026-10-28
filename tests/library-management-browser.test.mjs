import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const image={name:'Cover.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#a6bb87"/><circle cx="240" cy="135" r="65" fill="#293128"/></svg>')};
async function checkLayout(page){
  const report=await new AxeBuilder({page}).include('.studio-main').analyze();
  assert.deepEqual(report.violations.map(row=>({id:row.id,nodes:row.nodes.map(node=>node.target)})),[]);
  await page.setViewportSize({width:1200,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}

test('the dedicated library imports, filters and manages exact assets without opening an editor',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    await page.getByRole('heading',{name:'Assets.',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Filter by project').count(),0);
    assert.equal(await page.getByRole('button',{name:'Import files',exact:true}).isEnabled(),true);
    await page.getByLabel('Import assets',{exact:true}).setInputFiles(image);
    await page.getByRole('heading',{name:'Cover',exact:true}).waitFor();assert.equal(state.assets.size,1);
    // A list refresh can expose the new asset before its import is committed.
    // Finish that dialog before opening the next picker or changing filters.
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('iframe').count(),0);
    await page.getByLabel('Import assets',{exact:true}).setInputFiles({name:'Autumn film.fcproj',mimeType:'application/json',buffer:await readFile(new URL('../public/studio/starters/1/filmcraft/Untitled film.fcproj',import.meta.url))});
    await page.getByRole('heading',{name:'Autumn film',exact:true}).waitFor();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByLabel('Filter by asset type').selectOption('image');
    await page.waitForFunction(()=>document.querySelectorAll('.studio-library-piece').length===1);
    assert.equal(await page.getByRole('heading',{name:'Cover',exact:true}).count(),1);
    await page.getByLabel('Filter by asset type').selectOption('');
    await page.getByLabel('Filter by application').selectOption('filmcraft');
    await page.getByRole('heading',{name:'Autumn film',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.studio-library-piece').length===1);
    await page.route('**/api/studio/media/jobs?*',route=>route.fulfill({json:{jobs:[],nextCursor:null,budget:{availableMicros:0,reason:'Isolated review'},providers:{perflo:{configured:false}}}}));
    const sources=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/studio/assets'&&new URL(request.url()).searchParams.get('kind')==='image');
    await page.getByRole('button',{name:'Find or generate media',exact:true}).click();
    assert.equal(new URL((await sources).url()).searchParams.has('appId'),false,'media choices must not inherit the gallery filter');
    await page.getByRole('heading',{name:'Find the missing piece.',exact:true}).waitFor();
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.getByLabel('Filter by application').selectOption('');await page.getByRole('heading',{name:'Cover',exact:true}).waitFor();
    await page.getByRole('button',{name:'List view',exact:true}).click();
    await checkLayout(page);
    if(process.env.LIBRARY_SCREENSHOT_DIR){await mkdir(process.env.LIBRARY_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.LIBRARY_SCREENSHOT_DIR,'library-list.png'),fullPage:true});await page.getByRole('button',{name:'Grid view',exact:true}).click();await page.screenshot({path:join(process.env.LIBRARY_SCREENSHOT_DIR,'library-grid.png'),fullPage:true});}
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Cover',exact:true})}).click();
    await page.getByRole('heading',{name:'Original & editing copies',exact:true}).waitFor();
    const original=page.getByRole('link',{name:'Download Cover.svg',exact:true});
    assert.match(await original.getAttribute('href'),/\/file\?path=Cover.svg$/);
    await page.getByRole('button',{name:'Rename file: Cover',exact:true}).click();await page.getByLabel('File name',{exact:true}).fill('Opening artwork');await page.getByRole('button',{name:'Save file name',exact:true}).click();
    await page.getByRole('heading',{name:'Opening artwork',exact:true}).waitFor();
    assert.equal([...state.assets.values()].find(asset=>asset.asset_kind==='image').name,'Opening artwork');
    await checkLayout(page);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('exports attach to a new native revision, preserve the original, and download as a complete package',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    await page.getByRole('heading',{name:'Assets.',exact:true}).waitFor();
    await page.getByLabel('Import assets',{exact:true}).setInputFiles({name:'Film.fcproj',mimeType:'application/json',buffer:await readFile(new URL('../public/studio/starters/1/filmcraft/Untitled film.fcproj',import.meta.url))});
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Film',exact:true})}).click();
    await page.getByRole('button',{name:'Add exports',exact:true}).click();
    const asset=[...state.assets.values()][0],original=asset.current_revision_id,originalBytes=state.bytes.get(original+'/Film.fcproj');
    await page.getByLabel('Export files',{exact:true}).setInputFiles(image);
    await page.getByRole('button',{name:'Save exports to library',exact:true}).click();
    await page.getByText('Your new revision is saved.',{exact:true}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,2);
    const current=state.revisions.get(asset.current_revision_id);assert.equal(current.expectedBaseRevisionId,original);
    assert.deepEqual(state.bytes.get(original+'/Film.fcproj'),originalBytes);
    assert.deepEqual(state.bytes.get(current.id+'/Film.fcproj'),originalBytes);
    const exported=current.package.files.find(file=>file.role==='export');assert.deepEqual(state.bytes.get(current.id+'/'+exported.path),image.buffer);
    await page.getByRole('link',{name:`Download ${exported.path}`,exact:true}).waitFor();
    await checkLayout(page);
    if(process.env.LIBRARY_SCREENSHOT_DIR){await mkdir(process.env.LIBRARY_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.LIBRARY_SCREENSHOT_DIR,'asset-details.png'),fullPage:true});}
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download package',exact:true}).click();const download=await pending;
    assert.equal(download.suggestedFilename(),'Film.zip');assert.equal(await download.failure(),null);
    const bytes=await readFile(await download.path());assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.ok(bytes.includes(originalBytes));assert.ok(bytes.includes(image.buffer));
    await page.getByRole('button').filter({has:page.getByText('Revision 1',{exact:true})}).click();
    await page.getByText('No exports saved yet.',{exact:false}).waitFor();
    assert.match(await page.getByRole('link',{name:'Open in FilmCraft',exact:true}).getAttribute('href'),new RegExp(`revision=${original}`));
    await page.reload();
    await page.getByRole('button').filter({has:page.getByText('Revision 1',{exact:true})}).waitFor();
    assert.equal(await page.getByRole('button').filter({has:page.getByText('Revision 1',{exact:true})}).getAttribute('aria-pressed'),'true');
    assert.match(await page.getByRole('link',{name:'Open in FilmCraft',exact:true}).getAttribute('href'),new RegExp(`revision=${original}`));
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('native revision import rejects mismatched projects and missing files before writing, and freezes a retry',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    const film={name:'Film.fcproj',mimeType:'application/json',buffer:await readFile(new URL('../public/studio/starters/1/filmcraft/Untitled film.fcproj',import.meta.url))};
    await page.getByLabel('Import assets',{exact:true}).setInputFiles(film);
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Film',exact:true})}).click();
    await page.getByRole('button',{name:'Import revision',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Native file and linked media',{exact:true}).setInputFiles({name:'Wrong.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('wrong Craft')});
    await dialog.getByRole('button',{name:'Save native package',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:"this application's supported native project"}).waitFor();
    assert.equal(state.revisions.size,1);
    await dialog.getByLabel('Replace selected files',{exact:true}).setInputFiles({...film,buffer:Buffer.from(JSON.stringify({format:'filmcraft.project',schema_version:15,project:{items:{a:{kind:{Media:{media:{File:{path:'clip.mp4'}}}}}}}}))});
    await dialog.getByRole('button',{name:'Save native package',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'missing: clip.mp4'}).waitFor();
    assert.equal(state.revisions.size,1);
    await dialog.getByLabel('Replace selected files',{exact:true}).setInputFiles(film);
    await dialog.getByLabel('Exports for other applications (optional)',{exact:true}).setInputFiles({...image,buffer:Buffer.alloc(0)});
    await dialog.getByRole('button',{name:'Save native package',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'between 1 byte'}).waitFor();
    assert.equal(state.revisions.size,1);
    await dialog.getByLabel('Exports for other applications (optional)',{exact:true}).setInputFiles(image);
    state.failCommitReply=true;
    await dialog.getByRole('button',{name:'Save native package',exact:true}).click();
    await dialog.getByRole('button',{name:'Continue import',exact:true}).waitFor();
    assert.equal(state.revisions.size,2);
    assert.equal(await dialog.getByLabel('Replace selected files',{exact:true}).isDisabled(),true);
    assert.equal(await dialog.getByLabel('Revision note',{exact:true}).isDisabled(),true);
    await dialog.getByRole('button',{name:'Continue import',exact:true}).click();
    await page.getByText('Your new revision is saved.',{exact:true}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,2);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
