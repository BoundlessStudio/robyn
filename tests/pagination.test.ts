import test from "node:test";
import assert from "node:assert/strict";
import {finishPage,readPage,pageFilter,literalSearch} from "../src/studio/pagination";

test("cursor pagination preserves timestamp ties and reaches assets/revisions beyond previous limits",()=>{
  const rows=Array.from({length:405},(_,i)=>({id:`00000000-0000-4000-8000-${String(999999-i).padStart(12,"0")}`,created_at:"2026-10-25T00:00:00.123456+00:00"}));
  const seen:string[]=[];let remaining=rows;
  while(remaining.length){
    const result=finishPage(remaining.slice(0,101),100);seen.push(...result.items.map(row=>row.id));
    if(!result.nextCursor)break;
    const {after}=readPage(`https://test/?cursor=${result.nextCursor}`);
    assert.equal(after!.time,rows[0].created_at,"microsecond precision survives the cursor");
    assert.match(pageFilter(after!),/id\.lt\./);
    remaining=rows.filter(row=>row.created_at<after!.time||row.created_at===after!.time&&row.id<after!.id);
  }
  assert.deepEqual(seen,rows.map(row=>row.id));assert.equal(new Set(seen).size,405);
  const malicious=Buffer.from(JSON.stringify({id:rows[0].id,time:"2026-10-25T00:00:00Z),workspace_id.neq.secret"})).toString("base64url");
  assert.throws(()=>readPage(`https://test/?cursor=${malicious}`),/Invalid page/);
  assert.equal(literalSearch("100%_draft"),"%100\\%\\_draft%");
});
