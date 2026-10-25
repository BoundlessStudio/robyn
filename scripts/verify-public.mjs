// Post-build public UI gate. No authentication, creator data or paid calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const require=createRequire(import.meta.url);
const engines={chromium,firefox,webkit};
const requested=(process.env.PUBLIC_TEST_BROWSERS??'chromium').split(',');
if(!requested.length||requested.some(name=>!Object.hasOwn(engines,name)))throw Error('Unknown public test browser');
const output=process.env.PUBLIC_QA_OUTPUT?resolve(process.env.PUBLIC_QA_OUTPUT):null;
if(output)await mkdir(output,{recursive:true});
const socket=createServer();await new Promise(done=>socket.listen(0,'127.0.0.1',done));
const port=socket.address().port;await new Promise(done=>socket.close(done));
const origin=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let exited=false;child.on('exit',()=>{exited=true;});
// Drain output without publishing environment/server details in the report.
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
const results=[];
try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    if(exited)throw Error('Public verification server exited before startup');
    if(await fetch(origin+'/support').then(r=>r.ok).catch(()=>false)){ready=true;break;}
    await delay(500);
  }
  if(!ready)throw Error('Public verification server did not become ready');
  for(const name of requested){
    const browser=await engines[name].launch({headless:true});
    try{
      let defaultLinksExcluded=false;
      if(name==='webkit'&&process.platform==='win32'){
        // Distinguish the port's default from a product regression using a
        // standalone native anchor. Never weaken checks for other engines/OSes.
        const control=await browser.newPage();
        await control.setContent('<!doctype html><html lang="en"><body><a href="#target">Native link control</a></body></html>');
        await control.keyboard.press('Tab');
        defaultLinksExcluded=await control.evaluate(()=>document.activeElement.tagName!=='A');
        await control.close();
      }
      for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
        for(const path of ['/','/support','/privacy']){
          const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();
          const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
          const response=await page.goto(origin+path,{waitUntil:'networkidle'});assert.equal(response.status(),200);
          await page.evaluate(()=>document.fonts.ready);
          const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
          // Keep navigation/focus state isolated per page. Exercise input before
          // axe uses secondary pages while inspecting frames.
          await page.bringToFront();
          await page.keyboard.press('Tab');
          let keyboardFocus=await page.evaluate(()=>document.activeElement!==document.body&&document.activeElement.matches(':focus-visible'));
          let keyboardNavigation='Tab';
          // WebKit can default to form-controls-only navigation. Option/Alt+Tab
          // temporarily includes links (WKPreferences.tabFocusesLinks). Exercise
          // that real keyboard route without forcing focus or changing the DOM.
          if(!keyboardFocus&&name==='webkit'){
            await page.keyboard.press('Alt+Tab');keyboardNavigation='Tab then Alt+Tab';
            keyboardFocus=await page.evaluate(()=>document.activeElement!==document.body&&document.activeElement.matches(':focus-visible'));
          }
          const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
          const violations=scan.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));
          const keyboardLimitation=!keyboardFocus&&defaultLinksExcluded?'Windows WebKit excludes implicit links in its default keyboard settings; reproduced with a plain HTML anchor. Full link navigation remains unverified.':null;
          const entry={browser:name,version:browser.version(),viewport,path,violations,horizontalOverflow:dimensions.scroll>dimensions.width+1,keyboardFocus,keyboardNavigation,keyboardLimitation,pageErrors:[...pageErrors]};
          results.push(entry);
          if(output)await page.screenshot({path:resolve(output,`${name}-${viewport.width}-${path==='/'?'home':path.slice(1)}.png`),fullPage:false});
          assert.deepEqual(violations,[],`${name} ${path} at ${viewport.width}px`);
          assert.equal(entry.horizontalOverflow,false,`${name} ${path}: horizontal overflow`);
          if(!keyboardLimitation)assert.equal(keyboardFocus,true,`${name} ${path}: keyboard focus must be visible`);
          assert.deepEqual(pageErrors,[]);
          await context.close();
        }
      }
    }finally{await browser.close();}
  }
  const limitations=results.filter(row=>row.keyboardLimitation).length;
  console.log(`Public layout/axe checks passed: ${results.length} page/viewport/engine combinations. Keyboard focus passed: ${results.filter(row=>row.keyboardFocus).length}; explicitly unverified platform cases: ${limitations}.`);
}finally{
  if(output)await writeFile(resolve(output,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Public pages only; no native-editor, physical-device or screen-reader certification',results},null,2)+'\n');
  child.kill();
}
