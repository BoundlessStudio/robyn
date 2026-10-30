import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';

function contrast(foreground,background){
  const light=rgb=>rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const a=light(foreground),b=light(background);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
async function controlContrast(button){
  const colors=await button.evaluate(node=>{
    const parse=color=>color.match(/[\d.]+/g).map(Number),style=getComputedStyle(node),surface=getComputedStyle(node.closest('.research-notebook'));
    const base=parse(surface.backgroundColor),background=parse(style.backgroundColor),alpha=background[3]??1;
    return {foreground:parse(style.color).slice(0,3),background:background.slice(0,3).map((n,i)=>n*alpha+base[i]*(1-alpha))};
  });return contrast(colors.foreground,colors.background);
}
test('Notes toolbar keeps readable ink on its paper surface during hover and keyboard focus',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser),assetId=randomUUID(),revisionId=randomUUID(),bytes=Buffer.from('# Saved Notes\nOriginal source-grounded notebook.\n');
    state.assets.set(assetId,{id:assetId,project_id:projectId,app_id:'research',name:'Saved Notes',asset_kind:'native',current_revision_id:revisionId});
    state.revisions.set(revisionId,{id:revisionId,assetId,state:'committed',revision_number:1,package:{dependencies:[],files:[{path:'Notes.md',role:'master',mimeType:'text/markdown',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}});
    state.bytes.set(revisionId+'/Notes.md',bytes);
    await page.goto(`${origin}/dashboard/projects/${projectId}?asset=${assetId}&revision=${revisionId}`);
    const edit=page.getByRole('button',{name:'Edit notebook',exact:true});
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Edit notebook'&&!b.disabled));
    await edit.hover();assert.ok(await controlContrast(edit)>=4.5,'hovered Notes action must remain readable on paper');
    await edit.click();await page.getByLabel('Notebook Markdown',{exact:true}).fill('# Edited Notes\nA local fixture draft only.\n');
    const save=page.getByRole('button',{name:'Save revision',exact:true});assert.equal(await save.isEnabled(),true);
    await save.hover();assert.ok(await controlContrast(save)>=4.5,'enabled Save revision keeps its contrast on hover');
    await page.getByRole('button',{name:'Read notebook',exact:true}).click();await page.keyboard.press('Tab');
    assert.ok(await controlContrast(save)>=4.5,'keyboard-focused Notes action must remain readable');
    assert.equal(state.revisions.size,1,'contrast review never publishes a notebook');
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
