import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';

test('expired media renews its exact source and restores playback without replacing the editor',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const bundle=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {SavedMedia} from './src/components/studio/SavedMedia';createRoot(document.getElementById('root')).render(<><iframe title="Native editor" src="/editor"/><SavedMedia revisionId="exact-revision" file={{path:'original/source.wav',mimeType:'audio/wav'}} name="Source"/></>);`,resolveDir:root,sourcefile:'fixture.tsx',loader:'tsx'},jsx:'automatic',bundle:true,write:false,platform:'browser',format:'iife',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
  // A real, three-second PCM file lets the browser perform metadata and seek.
  const wav=Buffer.alloc(44+24000,128);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(8000,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(24000,40);
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',error=>console.error(error.message));const tickets=[];
    await context.route('**/*',route=>{const url=new URL(route.request().url());
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
      if(url.pathname==='/api/studio/revisions/exact-revision/file'){tickets.push(url);return route.fulfill({contentType:'audio/wav',body:wav,status:206,headers:{'cache-control':'private, no-store','accept-ranges':'bytes','content-range':`bytes 0-${wav.length-1}/${wav.length}`}});}
      if(url.pathname.startsWith('/media-'))return route.fulfill({contentType:'audio/wav',body:wav});
      if(url.pathname==='/editor')return route.fulfill({contentType:'text/html',body:'<input aria-label="Unsaved native title" value="My unsaved edit">'});
      return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script src="/fixture.js"></script>'});
    });
    await page.goto('https://media.test/');await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1,{},{timeout:4000}).catch(async error=>{console.error(await page.evaluate(()=>({html:document.body.innerHTML,media:document.querySelector('audio')&&{src:document.querySelector('audio').src,error:document.querySelector('audio').error?.message}})),tickets.map(url=>url.href));throw error;});
    await page.evaluate(()=>{window.editorBefore=document.querySelector('iframe');document.querySelector('audio').currentTime=1.25;});
    await page.waitForFunction(()=>Math.abs(document.querySelector('audio').currentTime-1.25)<0.05,{},{timeout:5000});
    await page.clock.install();await page.clock.fastForward(360000);
    // Emulate the media element's error event after a signed provider URL expires.
    await page.evaluate(()=>document.querySelector('audio').dispatchEvent(new Event('error')));
    await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1&&document.querySelector('audio').src.includes('renew=')&&!document.querySelector('audio').src.endsWith('renew=0'));
    await page.waitForFunction(()=>Math.abs(document.querySelector('audio').currentTime-1.25)<0.05);
    assert.equal(tickets.length,2);assert.ok(tickets.every(url=>url.searchParams.get('path')==='original/source.wav'));
    assert.equal(await page.evaluate(()=>window.editorBefore===document.querySelector('iframe')),true);
    assert.equal(await page.frameLocator('iframe').getByLabel('Unsaved native title').inputValue(),'My unsaved edit');
    await page.evaluate(()=>document.querySelector('audio').dispatchEvent(new Event('error')));
    await page.getByRole('alert').waitFor();assert.equal(tickets.length,2,'repeated failure stops automatic retry');
  }finally{await browser.close();}
});
