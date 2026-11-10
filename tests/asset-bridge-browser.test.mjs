import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';
import {zipFiles} from './helpers/bridge-zip.mjs';
import {extractBridgeZip} from '../src/studio/archive-import.ts';

const browsers=process.env.BRIDGE_TEST_BROWSERS?.split(',')??['chromium'];
async function openBridge(page){await page.getByRole('button',{name:'Asset Bridge',exact:true}).click();await page.getByRole('dialog').waitFor();}

test('Import files preserves unfamiliar raw media and refuses executables before saving',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    const picker=page.getByLabel('Import assets',{exact:true});
    const raw=Buffer.from([0,118,47,49,128,255]);
    await picker.setInputFiles([
      {name:'render.exr',mimeType:'application/octet-stream',buffer:raw},
      {name:'setup.EXE',mimeType:'application/octet-stream',buffer:Buffer.from('blocked')},
    ]);
    await page.getByRole('alert').filter({hasText:'Blocked: setup.EXE'}).waitFor();
    assert.equal(state.requests.filter(request=>request.method==='POST').length,0);
    await page.keyboard.press('Escape');
    await picker.setInputFiles({name:'render.exr',mimeType:'application/octet-stream',buffer:raw});
    await page.getByRole('button',{name:'Upload all files',exact:true}).click();
    await page.getByText('Your files are saved in the asset library.',{exact:true}).waitFor();
    const asset=[...state.assets.values()][0],revision=[...state.revisions.values()][0];
    assert.equal(asset.asset_kind,'file');
    assert.equal(asset.app_id,null);
    assert.equal(revision.package.files[0].mimeType,'application/octet-stream');
    assert.deepEqual(state.bytes.get(revision.id+'/render.exr'),raw);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('directory upload preserves every file and resumes unknown creation and commit replies without duplicates',async()=>{
  const browser=await chromium.launch({headless:true}),parent=resolve(tmpdir()),folder=await mkdtemp(join(parent,'robyn-bridge-'));
  try{
    const expected=new Map([['data/input.mat',Buffer.from([0,255,128])],['scripts/calculate.m',Buffer.from('x = 2;')],['notes/readme.txt',Buffer.from('Original notes')],['empty.txt',Buffer.alloc(0)]]);
    for(const [path,bytes] of expected){await mkdir(dirname(join(folder,path)),{recursive:true});await writeFile(join(folder,path),bytes);}
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    await openBridge(page);
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose folder',exact:true}).click();await (await chooser).setFiles(folder);
    await page.getByLabel('Upload name',{exact:true}).fill('Research inputs');
    state.failCreationReply=true;await page.getByRole('button',{name:'Upload all files',exact:true}).click();
    await page.getByRole('button',{name:'Continue upload',exact:true}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    assert.equal(await page.getByLabel('Upload name',{exact:true}).isDisabled(),true);
    state.failCommitReply=true;await page.getByRole('button',{name:'Continue upload',exact:true}).click();
    await page.getByRole('button',{name:'Continue upload',exact:true}).waitFor();
    await page.getByRole('button',{name:'Continue upload',exact:true}).click();
    await page.getByText('All files are saved in your private library and available to Robyn.',{exact:true}).waitFor();
    const asset=[...state.assets.values()][0],revision=[...state.revisions.values()][0];
    assert.equal(asset.asset_kind,'file');assert.equal(asset.app_id,null);assert.equal(revision.package.files.length,expected.size);
    for(const file of revision.package.files)assert.deepEqual(state.bytes.get(revision.id+'/'+file.path),expected.get(file.path.slice(file.path.indexOf('/')+1)));
    const requests=state.requests.filter(request=>request.path==='/api/studio/imports');
    assert.equal(requests.length,2);assert.deepEqual(requests[0].input,requests[1].input);
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Research inputs',exact:true})}).click();
    await page.getByRole('heading',{name:'Uploaded files',exact:true}).waitFor();
    await page.getByRole('link',{name:`Download ${revision.package.files[0].path}`,exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:/^Download /}).count(),expected.size);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download folder',exact:true}).click();
    const downloaded=await download,files=await extractBridgeZip(new Blob([await readFile(await downloaded.path())]));
    assert.equal(files.length,expected.size);
    for(const file of files)assert.deepEqual(Buffer.from(await file.file.arrayBuffer()),expected.get(file.path.slice(file.path.indexOf('/')+1)));
    await page.getByRole('link',{name:'Use with Robyn',exact:true}).click();
    await page.getByRole('heading',{name:'Robyn.',exact:true}).waitFor();
    assert.ok(page.url().includes(`asset=${asset.id}`));assert.ok(page.url().includes(`revision=${revision.id}`));
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();if(dirname(resolve(folder))!==parent)throw Error('Unexpected cleanup path');await rm(folder,{recursive:true,force:true});}
});

for(const engine of browsers)test(`ZIP extraction and executable refusal work through the actual library in ${engine}`,async()=>{
  const browser=await ({chromium,firefox,webkit})[engine].launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    await openBridge(page);
    await page.getByLabel('Bridge files',{exact:true}).setInputFiles({name:'Installer.EXE',mimeType:'application/octet-stream',buffer:Buffer.from('binary')});
    await page.getByRole('alert').filter({hasText:'Blocked: Installer.EXE'}).waitFor();
    await page.getByLabel('Bridge archive',{exact:true}).setInputFiles({name:'blocked.zip',mimeType:'application/zip',buffer:zipFiles([{path:'data.txt',bytes:'Allowed'},{path:'nested/Setup.EXE',bytes:'Blocked'}])});
    await page.getByRole('alert').filter({hasText:'Blocked: nested/Setup.EXE'}).waitFor();
    assert.equal(state.requests.filter(request=>request.method==='POST').length,0);
    const expected=new Map([['Collection/café.mat',Buffer.from([0,128,255])],['Collection/compute.m',Buffer.from('x = 42;')],['Collection/empty',Buffer.alloc(0)]]);
    await page.getByLabel('Bridge archive',{exact:true}).setInputFiles({name:'Inputs.zip',mimeType:'application/zip',buffer:zipFiles([...expected].map(([path,bytes])=>({path,bytes})))});
    await page.getByRole('button',{name:'Upload all files',exact:true}).click();
    await page.getByText('All files are saved in your private library and available to Robyn.',{exact:true}).waitFor();
    const revision=[...state.revisions.values()][0];
    assert.deepEqual(revision.package.files.map(file=>file.path),[...expected.keys()]);
    for(const [path,bytes] of expected)assert.deepEqual(state.bytes.get(revision.id+'/'+path),bytes);
    await page.getByLabel('Filter by asset type').selectOption('file');await page.getByRole('heading',{name:'Inputs',exact:true}).waitFor();
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('reselecting an interrupted upload after reload preserves the creation identity',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:`/dashboard/projects/${projectId}/library`});
    const selected={name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Original notes')};
    await openBridge(page);await page.getByLabel('Bridge files',{exact:true}).setInputFiles(selected);
    state.failCreationReply=true;await page.getByRole('button',{name:'Upload all files',exact:true}).click();
    await page.getByRole('button',{name:'Continue upload',exact:true}).waitFor();
    await page.reload();await openBridge(page);await page.getByLabel('Bridge files',{exact:true}).setInputFiles(selected);
    await page.getByRole('button',{name:'Upload all files',exact:true}).click();
    await page.getByText('All files are saved in your private library and available to Robyn.',{exact:true}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    const requests=state.requests.filter(request=>request.path==='/api/studio/imports');
    assert.equal(requests.length,2);assert.deepEqual(requests[0].input,requests[1].input);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
