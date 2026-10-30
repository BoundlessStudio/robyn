import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {nativeImportFixture,origin,projectId} from './fixtures/native-import.mjs';

const browserType=({chromium,firefox,webkit})[process.env.NATIVE_IMPORT_BROWSER??'chromium'];
const settings=`/dashboard/projects/${projectId}/settings`;
const pendingKey='robyn-budget-pending:22222222-2222-4222-8222-222222222222';

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
