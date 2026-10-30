import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {studioDatabase} from './helpers/database.mjs';
import {applyStudioMigrations} from './helpers/robyn-database.mjs';

test('new studios start at $20 and repeated initialization preserves owner choices',async()=>{
  const db=await studioDatabase();
  try{
    await applyStudioMigrations(db);
    const owner=randomUUID();
    await db.query('insert into auth.users(id) values($1)',[owner]);
    const initialize=async()=> (await db.query("select initialize_studio($1,'[]') as id",[owner])).rows[0].id;
    const workspace=await initialize();
    const limit=async()=> (await db.query("select monthly_cap_micros from studio_employees where workspace_id=$1 and employee_key='robyn'",[workspace])).rows[0].monthly_cap_micros;
    assert.equal(Number(await limit()),20_000_000);
    for(const chosen of [0,75_000_000]){
      await db.query("update studio_employees set monthly_cap_micros=$2 where workspace_id=$1 and employee_key='robyn'",[workspace,chosen]);
      assert.equal(await initialize(),workspace);
      assert.equal(Number(await limit()),chosen);
    }
  }finally{await db.close();}
});
