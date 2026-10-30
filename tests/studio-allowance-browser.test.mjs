import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';

const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const settings=`/dashboard/projects/${projectId}/settings`;
const pendingKey='robyn-budget-pending:22222222-2222-4222-8222-222222222222';

test('settings support the $20 default, enforce $0–$100 and preserve a saved AI opt-out',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:settings});
    const section=page.locator('#studio-budget'),input=section.getByLabel('Monthly AI allowance (USD)');
    assert.equal(await input.inputValue(),'20');assert.equal(await input.getAttribute('min'),'0');assert.equal(await input.getAttribute('max'),'100');
    for(const value of ['-1','100.01']){
      await input.fill(value);
      assert.equal(await section.getByRole('button',{name:'Save Studio budget',exact:true}).isDisabled(),true);
    }
    await input.fill('100');
    assert.equal(await section.getByRole('button',{name:'Save Studio budget',exact:true}).isEnabled(),true);
    await input.fill('0');
    await section.getByRole('button',{name:'Save Studio budget',exact:true}).click();
    await section.getByRole('status').filter({hasText:'Studio budget saved.'}).waitFor();
    assert.equal(state.allowance,0);
    await page.reload();
    assert.equal(await input.inputValue(),'0');
    await section.getByRole('status').filter({hasText:'The AI helper is off.'}).waitFor();
    await page.goto(`${origin}/dashboard/projects/${projectId}/employees`);
    await page.getByLabel('Your idea',{exact:true}).fill('Create a first draft.');
    assert.equal(await page.getByRole('button',{name:'Make a first draft',exact:true}).isDisabled(),true);
    assert.equal(state.requests.filter(request=>request.path==='/api/studio/assignments'&&request.method==='POST').length,0);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('settings hide project activity and use the available width while project editing remains usable',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:settings,viewport:{width:1600,height:1000}});
    state.activity=Array.from({length:100},(_,index)=>({id:randomUUID(),kind:'revision.committed',created_at:new Date(2026,9,30,12,index).toISOString()}));
    await page.reload();
    const details=page.locator('#project-details');await details.waitFor();
    assert.equal(await page.getByRole('complementary',{name:'Project activity',includeHidden:true}).count(),0);
    assert.equal(await page.getByRole('heading',{name:'Project activity',includeHidden:true}).count(),0);
    const main=await details.boundingBox(),layout=await page.locator('.studio-settings-layout').boundingBox();
    assert.ok(Math.abs(main.width-layout.width)<1);
    await page.getByLabel('Project name',{exact:true}).fill('Settings still work');
    await page.getByRole('button',{name:'Save project details',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Project details saved.'}).waitFor();
    assert.equal(state.activity.length,100);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('one monthly allowance recovers a lost acknowledgement with the same operation',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:settings});state.failBudgetReply=true;
    const section=page.locator('#studio-budget');
    await section.getByLabel('Monthly AI allowance (USD)').fill('12.50');
    assert.equal(await section.getByRole('combobox').count(),0);
    assert.equal(await section.getByRole('spinbutton').count(),1);
    await section.getByRole('button',{name:'Save Studio budget',exact:true}).click();
    await section.getByRole('alert').filter({hasText:'acknowledgement was lost'}).waitFor();
    const first=state.requests.find(request=>request.path==='/api/studio/budgets'&&request.method==='PATCH').input;
    assert.equal(first.mode,'automatic');assert.equal(first.monthlyLimitMicros,12500000);assert.equal('allocations' in first,false);
    assert.equal(first.expectedPolicyOperationId,null);
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),pendingKey),first);
    state.failBudgetReply=false;
    await section.getByRole('button',{name:'Resume budget change',exact:true}).click();
    await section.getByRole('status').filter({hasText:'Studio budget saved.'}).waitFor();
    assert.deepEqual(state.requests.filter(request=>request.path==='/api/studio/budgets'&&request.method==='PATCH').map(request=>request.input),[first,first]);
    assert.equal(state.budgetChanges.size,1);assert.equal(await page.evaluate(key=>localStorage.getItem(key),pendingKey),null);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('a saved historical allocation request is preserved when the server requires recovery',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:settings});
    const pending={operationId:randomUUID(),monthlyLimitMicros:10000000,mode:'custom',allocations:{[randomUUID()]:10000000}};
    await page.evaluate(({key,pending})=>localStorage.setItem(key,JSON.stringify(pending)),{key:pendingKey,pending});
    await page.goto(origin+settings);
    const section=page.locator('#studio-budget');
    await section.getByRole('button',{name:'Resume budget change',exact:true}).click();
    await section.getByRole('alert').filter({hasText:'needs recovery'}).waitFor();
    assert.deepEqual(state.requests.filter(request=>request.path==='/api/studio/budgets'&&request.method==='PATCH').map(request=>request.input),[pending]);
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),pendingKey),pending);
    assert.equal(await section.getByRole('spinbutton').count(),0);assert.equal(state.budgetChanges.size,0);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});

test('an allowance change waits for durable browser storage before sending',async()=>{
  const browser=await browserType.launch({headless:true});
  try{
    const {page,state}=await nativeImportFixture(browser,{initialPath:settings});
    const section=page.locator('#studio-budget');await section.getByLabel('Monthly AI allowance (USD)').fill('8');
    await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Storage full');};});
    await section.getByRole('button',{name:'Save Studio budget',exact:true}).click();
    await section.getByRole('alert').filter({hasText:'Storage full'}).waitFor();
    assert.equal(state.requests.filter(request=>request.path==='/api/studio/budgets'&&request.method==='PATCH').length,0);
    assert.deepEqual(state.errors,[]);
  }finally{await browser.close();}
});
