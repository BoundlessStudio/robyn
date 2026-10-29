import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mediaUiFixture} from './helpers/media-ui.mjs';

for(const engine of [chromium,firefox,webkit])test(`${engine.name()}: media keyboard dialog and lost-response recovery preserve the exact request and editor`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
    const fixture=await mediaUiFixture(browser,{lostFirstReply:true});const{page,requests}=fixture;
    await page.frameLocator('iframe').getByLabel('Unsaved title').fill('Unfinished native edit');
    await page.evaluate(()=>{window.originalFrame=document.querySelector('iframe');});
    await page.keyboard.press('Tab');
    await page.getByRole('button',{name:'Open media',exact:true}).focus();await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'Generate',exact:true}).click();
    await page.getByRole('combobox',{name:'Service',exact:true}).selectOption('blockrun-tts');
    await page.getByLabel('Asset name',{exact:true}).fill('Speech acceptance');
    await page.getByLabel('Prompt or speech text',{exact:true}).fill('x'.repeat(33));
    assert.match(await page.getByRole('dialog').innerText(),/Maximum reservation: \$0\.002733/);
    assert.notEqual(await page.locator('option[value="paysponge-gemini-image"]').getAttribute('disabled'),null);
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    assert.deepEqual(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
    await page.getByRole('button',{name:'Generate',exact:true}).last().click();
    await page.getByRole('button',{name:'Retry saved request'}).waitFor();
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Open media',exact:true}).evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(()=>document.querySelector('iframe')===window.originalFrame),true);
    assert.equal(await page.frameLocator('iframe').getByLabel('Unsaved title').inputValue(),'Unfinished native edit');
    fixture.setBudget(0);
    const retry=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/studio/media/jobs'&&response.request().method()==='POST'&&response.status()===200);
    await page.keyboard.press('Enter');await page.getByRole('button',{name:'Retry saved request'}).click();
    await retry;
    await page.getByRole('button',{name:'Close dialog',exact:true,disabled:false}).waitFor();
    assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.emulateMedia({forcedColors:'active'});await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog'))),true);
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.emulateMedia({forcedColors:'none'});
    await page.setViewportSize({width:1200,height:900});
    await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
    // Halving the CSS viewport checks the reflow caused by 200% browser zoom.
    // CSS zoom is unsuitable here: it also doubles vh-sized modal bounds.
    // This isolated component check does not widen the desktop-entry baseline.
    await page.setViewportSize({width:600,height:450});
    const fit=await page.getByRole('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:el.scrollWidth>el.clientWidth};});
    assert.ok(fit.left>=0&&fit.right<=fit.width+1&&fit.top>=0&&fit.bottom<=fit.height+1);assert.equal(fit.overflow,false);
    await page.getByRole('button',{name:'Close dialog',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button',{name:'Open media',exact:true}).evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.frameLocator('iframe').getByLabel('Unsaved title').inputValue(),'Unfinished native edit');
    assert.deepEqual(fixture.errors,[]);
  }finally{await browser.close();}
});

test('media refuses a new paid submission when its recovery identity cannot be persisted',async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const {page,requests}=await mediaUiFixture(browser);
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('robyn-media-pending:'))throw new DOMException('Storage unavailable','QuotaExceededError');return original.call(this,key,value);};});
    await page.getByRole('button',{name:'Open media',exact:true}).click();
    await page.getByRole('button',{name:'Generate',exact:true}).click();
    await page.getByLabel('Asset name',{exact:true}).fill('Preserve this request');
    await page.getByLabel('Prompt or speech text',{exact:true}).fill('A robin in a garden');
    await page.getByRole('button',{name:'Generate',exact:true}).last().click();
    await page.getByRole('alert').filter({hasText:'no additional request was sent'}).waitFor();
    assert.equal(requests.length,0);
    await page.reload();
    assert.equal(requests.length,0);
  }finally{await browser.close();}
});
