import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';

test('desktop entry blocks compact first use and retains the exact open editor and unsaved work across narrowing',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const bundle=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {DesktopStudioGate} from './src/components/studio/DesktopStudioGate';createRoot(document.getElementById('root')).render(<DesktopStudioGate><main><h1>Saved project</h1><label>Unsaved note<input defaultValue="Original"/></label><iframe title="Open editor" srcDoc="<p>Isolated editor session</p>"/></main></DesktopStudioGate>);`,resolveDir:root,sourcefile:'gate-fixture.tsx',loader:'tsx'},jsx:'automatic',bundle:true,write:false,platform:'browser',format:'iife',tsconfig:root+'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react";export default function Link(props){return React.createElement("a",props)}',loader:'js',resolveDir:root}));}}]});
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:600,height:900}}),page=await context.newPage();
    await context.route('**/*',route=>route.fulfill(new URL(route.request().url()).pathname==='/fixture.js'?{contentType:'text/javascript',body:bundle.outputFiles[0].text}:{contentType:'text/html',body:'<!doctype html><html lang="en"><head><title>Desktop gate fixture</title></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'}));
    await page.goto('https://desktop-gate.test/');await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('iframe').count(),0);
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),true);
    await page.setViewportSize({width:1440,height:1000});await page.getByLabel('Unsaved note').waitFor();
    await page.getByLabel('Unsaved note').fill('Keep this unfinished edit');
    await page.evaluate(()=>{window.originalEditor=document.querySelector('iframe');window.originalEditor.sessionIdentity='persistent';});
    await page.setViewportSize({width:720,height:1000});await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator('.desktop-studio-content').evaluate(el=>el.inert),true);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog'))),true);
    await page.setViewportSize({width:1440,height:1000});await page.getByLabel('Unsaved note').waitFor();
    assert.equal(await page.getByLabel('Unsaved note').inputValue(),'Keep this unfinished edit');
    assert.equal(await page.evaluate(()=>document.querySelector('iframe')===window.originalEditor&&window.originalEditor.sessionIdentity==='persistent'),true);
  }finally{await browser.close();}
});
