import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
import {nativeImportFixture, dropDocument, origin} from './fixtures/native-import.mjs';

test('a dropped native document opens, edits, saves and reopens from the library with its original revision intact',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await dropDocument(page,'Autumn brief.DOCX','Original transport fixture');
    const editor=page.frameLocator('iframe[title="WordCraft editor"]');
    await editor.getByText('Ready',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Application',{exact:true}).count(),0);
    assert.equal(await page.getByLabel('Native master',{exact:true}).count(),0);
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    const asset=[...state.assets.values()][0],original=[...state.revisions.values()][0];
    assert.equal(asset.name,'Autumn brief');assert.equal(asset.app_id,'wordcraft');
    assert.deepEqual(original.package.dependencies,[]);
    assert.equal(original.package.files[0].path,'Autumn brief.DOCX');
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Original transport fixture');
    await editor.getByLabel('Document text').click();
    await editor.getByLabel('Document text').press('Control+a');
    await editor.getByLabel('Document text').pressSequentially('Edited transport fixture');
    await editor.getByRole('button',{name:'Save document'}).click();
    await editor.getByText('Saved',{exact:true}).waitFor();
    assert.equal(state.revisions.size,2);assert.equal(state.assets.size,1);
    assert.equal(state.bytes.get(original.id+'/Autumn brief.DOCX').toString(),'Original transport fixture');
    const edited=state.revisions.get(asset.current_revision_id);
    assert.equal(edited.expectedBaseRevisionId,original.id);
    await page.waitForLoadState('networkidle'); // Let this fixture's finite refresh requests finish before navigation.
    await page.goto(origin+'/dashboard/library');
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Autumn brief',exact:true})}).click();
    await editor.getByText('Ready',{exact:true}).waitFor();
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Edited transport fixture');
    await page.waitForLoadState('networkidle');
    await page.reload();await editor.getByText('Ready',{exact:true}).waitFor();
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Edited transport fixture');
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('file-picker import retries lost creation and commit replies without duplicate assets or revisions',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    state.failCreationReply=true;
    const chooser=page.waitForEvent('filechooser');
    await page.locator('.project-blank').getByRole('button',{name:'Bring existing files',exact:true}).click();
    await (await chooser).setFiles({name:'Budget.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('Spreadsheet transport fixture')});
    await page.getByRole('alert').waitFor();assert.equal(state.assets.size,1);
    state.failCommitReply=true;
    await page.getByRole('button',{name:'Continue import'}).click();
    await page.getByRole('button',{name:'Continue import'}).waitFor();
    assert.equal(state.revisions.size,1);
    await page.getByRole('button',{name:'Continue import'}).click();
    await page.frameLocator('iframe[title="GridCraft editor"]').getByText('Ready',{exact:true}).waitFor();
    const creations=state.requests.filter(req=>req.path==='/api/studio/assets'&&req.method==='POST');
    assert.equal(creations.length,2);assert.deepEqual(creations[0].input,creations[1].input);
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('unrecognised and mixed files stay editable in the detailed import without starting a save',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    await dropDocument(page,'Slides.pptx','Unsupported transport fixture');
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('status').innerText(),/recognised/);
    assert.equal(await page.getByLabel('Application',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('Native master',{exact:true}).inputValue(),'Slides.pptx');
    assert.equal(await page.getByRole('button',{name:'Save native package'}).isDisabled(),true);
    assert.equal(state.assets.size,0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.project-header').getByRole('button',{name:'Bring existing files'}).evaluate(button=>button===document.activeElement),true);
    await dropDocument(page,'Film.fcproj',JSON.stringify({format:'filmcraft.project',schema_version:15,project:{items:{a:{kind:{Media:{media:{File:{path:'clip.mp4'}}}}}}}}));
    await page.getByRole('dialog').waitFor();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(),/missing: clip.mp4/);
    assert.equal(await page.getByLabel('Application',{exact:true}).count(),0);
    assert.equal(state.assets.size,0);
    await page.keyboard.press('Escape');
    await page.getByLabel('Choose documents to import').setInputFiles([
      {name:'Brief.docx',mimeType:'application/octet-stream',buffer:Buffer.from('document')},
      {name:'Budget.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('spreadsheet')},
    ]);
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByLabel('Project to open',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('Project to open',{exact:true}).locator('option').count(),3);
    assert.equal(state.assets.size,0);
    await page.getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Import a folder or linked files',exact:true}).click();
    assert.equal(await page.getByLabel('Choose project folder').count(),1);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('an import can pause and resume, and dropping a second file respects unsaved editor work',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    state.holdTransfers=true;
    const transfersRequested=page.waitForRequest(request=>request.url().endsWith('/transfers'));
    await dropDocument(page,'Brief.docx','Original transport fixture');
    await transfersRequested;
    await page.getByRole('button',{name:'Pause import'}).waitFor();
    await page.getByRole('button',{name:'Pause import'}).click();
    await page.getByRole('button',{name:'Continue import'}).waitFor();
    state.releaseTransfers?.();state.holdTransfers=false;
    await page.getByRole('button',{name:'Continue import'}).click();
    const editor=page.frameLocator('iframe[title="WordCraft editor"]');
    await editor.getByText('Ready',{exact:true}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    await editor.getByLabel('Document text').click();
    await editor.getByLabel('Document text').press('Control+a');
    await editor.getByLabel('Document text').pressSequentially('Keep this unsaved edit');
    await page.getByRole('status',{name:/Unsaved/}).waitFor();
    page.once('dialog',dialog=>dialog.dismiss());
    await dropDocument(page,'Print.pdf','Another transport fixture','.project-assets');
    assert.equal(state.assets.size,1);
    assert.equal(await editor.getByLabel('Document text').inputValue(),'Keep this unsaved edit');
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('the folder path still preserves a native master and its linked files with relative paths',async()=>{
  const browser=await browserType.launch({headless:true});
  const folder=await mkdtemp(join(tmpdir(),'robyn-native-import-'));
  try{
    await mkdir(join(folder,'documents'));await mkdir(join(folder,'images'));
    await writeFile(join(folder,'documents','Session.scraft'),JSON.stringify({format_version:1,name:'Session',tracks:[],sources:[{path:'../images/cover.png'}]}));
    await writeFile(join(folder,'unrelated-private.txt'),'Do not upload unrelated folder files');
    await writeFile(join(folder,'images','cover.png'),'Linked transport fixture');
    const {page,state}=await nativeImportFixture(browser);
    await page.getByRole('button',{name:'Import a folder or linked files',exact:true}).click();
    await page.getByLabel('Choose project folder').setInputFiles(folder);
    await page.frameLocator('iframe[title="SoundCraft editor"]').getByText('Ready',{exact:true}).waitFor();
    const revision=[...state.revisions.values()][0];
    assert.deepEqual(revision.package.files.map(file=>({path:file.path,role:file.role})).sort((a,b)=>a.path.localeCompare(b.path)),[
      {path:'documents/Session.scraft',role:'master'},
      {path:'images/cover.png',role:'dependency'},
    ]);
    assert.deepEqual(state.errors,[]);
  }finally{
    await browser.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep+'robyn-native-import-'));
    await rm(folder,{recursive:true,force:true});
  }
});


test('a linked SoundCraft session asks only for missing media and saves once the file is added',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    const session=JSON.stringify({format_version:1,name:'Session',tracks:[],sources:[{path:'voice.wav'}]});
    await dropDocument(page,'Session.scraft',session);
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(),/missing: voice.wav/);
    assert.equal(state.requests.some(request=>request.method==='POST'),false,'preflight must finish before any write');
    const chooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Add linked files',exact:true}).click();
    await (await chooser).setFiles({name:'voice.wav',mimeType:'audio/wav',buffer:Buffer.from('RIFF1234WAVEfixture')});
    await page.frameLocator('iframe[title="SoundCraft editor"]').getByText('Ready',{exact:true}).waitFor();
    const asset=[...state.assets.values()][0],revision=[...state.revisions.values()][0];
    assert.equal(asset.app_id,'soundcraft');assert.equal(asset.name,'Session');
    assert.deepEqual(revision.package.files.map(file=>[file.path,file.role]),[['Session.scraft','master'],['voice.wav','dependency']]);
    assert.equal(state.bytes.get(revision.id+'/Session.scraft').toString(),session);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('common source files save without a Craft, preview, retry uncertain replies and reopen from the library',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser);
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="orange"/></svg>');
    state.failCreationReply=true;
    await page.getByLabel('Choose documents to import').setInputFiles({name:'Shared artwork.svg',mimeType:'image/svg+xml',buffer:svg});
    await page.getByRole('button',{name:'Continue import'}).waitFor();
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    state.failCommitReply=true;
    await page.getByRole('button',{name:'Continue import'}).click();
    await page.getByRole('button',{name:'Continue import'}).waitFor();
    await page.getByRole('button',{name:'Continue import'}).click();
    const preview=page.getByRole('img',{name:'Preview of Shared artwork'});
    await preview.waitFor();
    await preview.evaluate(img=>img.decode());
    const asset=[...state.assets.values()][0],revision=[...state.revisions.values()][0];
    assert.equal(asset.app_id,null);assert.equal(asset.asset_kind,'image');
    assert.equal(state.assets.size,1);assert.equal(state.revisions.size,1);
    assert.deepEqual(state.bytes.get(revision.id+'/Shared artwork.svg'),svg);
    assert.equal(await page.locator('iframe').count(),0);
    assert.match(await page.locator('.source-import-note').innerText(),/reusable source media/);
    await page.goto(origin+'/dashboard/library');
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Shared artwork',exact:true})}).click();
    await preview.waitFor();await preview.evaluate(img=>img.decode());
    await page.getByLabel('Choose documents to import').setInputFiles([
      {name:'Voice.wav',mimeType:'audio/wav',buffer:Buffer.from('RIFF1234WAVEfixture')},
      {name:'Clip.mp4',mimeType:'video/mp4',buffer:Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom')])},
    ]);
    await page.getByText('Clip',{exact:true}).first().waitFor();
    assert.equal(state.assets.size,3);assert.equal(state.revisions.size,3);
    assert.deepEqual([...state.assets.values()].map(a=>a.app_id),[null,null,null]);
    await page.locator('video').waitFor();
    assert.equal(await page.locator('video').count(),1);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
