import test from "node:test";
import assert from "node:assert/strict";
import {studioApps} from "../src/studio/apps/registry";
import {studioTools} from "../src/studio/tools";
import {research} from "../src/studio/specialists/research";
import {isAppReady,isEmployeeReady} from "../src/studio/manifest";

test("Research is independent of the Craft catalogue and cannot run without a pinned workstation",()=>{
  assert.equal(studioApps.some(app=>app.id==="research"),false);
  assert.equal(studioTools.length,studioApps.length+1);
  assert.equal(studioTools.filter(app=>app.id==="research").length,1);
  assert.equal(isEmployeeReady({...research,workstation:{...research.workstation,template:null}}),false);
  assert.equal(isAppReady({...research,formats:{...research.formats,verification:"pending"}}),false);
  assert.equal(isAppReady({...research,kind:"craft"}),false,"a Craft must still provide a pinned native editor URL");
});
