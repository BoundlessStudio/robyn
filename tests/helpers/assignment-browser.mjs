import { build } from "esbuild";
import { fileURLToPath } from "node:url";

export const project = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const director = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const specialist = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const originalRef = { assetId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd", revisionId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
export const changedRef = { ...originalRef, revisionId:"ffffffff-ffff-4fff-8fff-ffffffffffff" };
export const journalKey = `robyn-assignment-draft:${project}:assignments`;

export async function assignmentBrowserFixture(browser) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const bundle = await build({
    stdin: { contents: `import {useState} from 'react'; import {createRoot} from 'react-dom/client'; import {AssignmentPanel} from './src/components/studio/AssignmentPanel';
      function Fixture(){const[visible,setVisible]=useState(true),[mode,setMode]=useState('assignments'),[ref,setRef]=useState(location.search?${JSON.stringify(changedRef)}:${JSON.stringify(originalRef)}),[opened,setOpened]=useState('');
        return <main><nav><button onClick={()=>setVisible(v=>!v)}>{visible?'Close composer':'Open composer'}</button><button onClick={()=>setMode(m=>m==='assignments'?'director':'assignments')}>Switch panel</button><button onClick={()=>setRef(${JSON.stringify(changedRef)})}>Change open revision</button></nav>
          <output aria-label="Opened revision">{opened}</output>{visible&&<AssignmentPanel projectId="${project}" mode={mode} preferredAppId={location.search?'gridcraft':'wordcraft'} selectedRef={ref} onOpen={r=>setOpened(r.revisionId)}/>}</main>}
      createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir:root, sourcefile:"assignment-recovery-fixture.tsx", loader:"tsx" },
    bundle:true,write:false,platform:"browser",format:"iife",define:{"process.env.NODE_ENV":'"production"'},tsconfig:root+"tsconfig.json",
  });
  const context = await browser.newContext({viewport:{width:1200,height:1000},serviceWorkers:"block"});
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const state = {calls:[],persisted:[],accepted:new Map(),acknowledge:false,allowance:5000000,errors:[]};
  page.on("pageerror", error => state.errors.push(error.message));
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/fixture.js") return route.fulfill({contentType:"text/javascript",body:bundle.outputFiles[0].text});
    if (url.pathname === "/api/studio/assignments") {
      if (request.method() === "POST") {
        const payload = request.postDataJSON();
        state.calls.push(payload);
        state.persisted.push(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending, journalKey));
        if(payload.employeeId!==director&&!state.accepted.has(payload.requestId))return route.fulfill({status:409,json:{error:{message:"The saved employee has retired. Your original brief is preserved."}}});
        if (!state.accepted.has(payload.requestId)) state.accepted.set(payload.requestId, {id:crypto.randomUUID(),payload});
        if (!state.acknowledge) return route.fulfill({status:503,json:{error:{message:"Your assignment is saved. Retry this request to reconnect it."}}});
        return route.fulfill({status:202,json:{assignmentId:state.accepted.get(payload.requestId).id,state:"queued"}});
      }
      return route.fulfill({json:{employees:[{id:director,role:"Robyn",appId:null,ready:true}],assignments:[...state.accepted.values()].map(({id,payload})=>({id,employeeId:payload.employeeId,role:"Robyn",appId:payload.appId??null,brief:payload.brief,state:"queued",createdAt:"2026-10-25T12:00:00Z",deliverables:[]}))}});
    }
    if (url.pathname.startsWith("/api/studio/budgets/")) return route.fulfill({json:{availableMicros:state.allowance,reason:state.allowance?null:"No AI allowance remains."}});
    if (url.pathname === "/") return route.fulfill({contentType:"text/html",body:'<!doctype html><html><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script src="/fixture.js"></script></body></html>'});
    return route.fulfill({status:404,body:"All other requests blocked by isolated fixture"});
  });
  return {context,page,state};
}
