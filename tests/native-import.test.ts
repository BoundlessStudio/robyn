import test from "node:test";
import assert from "node:assert/strict";
import { nativeImportApp, nativeImportApps, directNativeImportApp, importedDocumentName, checkNativeImport } from "../src/studio/native-import";
import { studioApps } from "../src/studio/apps/registry";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

test("the vendored native inspector retains its exact generated provenance bytes",async()=>{
  const root=new URL('../src/studio/generated/',import.meta.url);
  const bytes=await readFile(new URL('native-inspector.mjs',root));
  const proof=JSON.parse(await readFile(new URL('native-inspector.provenance.json',root),'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.sha256);
});

test("native recognition handles filenames but refuses conversion, ambiguous formats and unverified editors", () => {
  assert.equal(nativeImportApp("Autumn exhibition.DOCX")?.id, "wordcraft");
  assert.equal(nativeImportApp("Budget.v2.xlsx")?.id, "gridcraft");
  assert.equal(nativeImportApp("Print.pdf")?.id, "pdfcraft");
  assert.equal(directNativeImportApp("Brief.docx")?.id, "wordcraft");
  assert.equal(directNativeImportApp("Budget.xlsx")?.id, "gridcraft");
  assert.equal(directNativeImportApp("Print.pdf")?.id, "pdfcraft");
  for (const file of ["Film.fcproj", "Sound.scraft", "Photo.pcraft", "Artwork.vectorcraft", "Layout.designcraft", "Slides.deckcraft", "Catalog.snap", "Motion.ecproj"]) {
    assert.ok(nativeImportApp(file));
    assert.equal(directNativeImportApp(file)?.id, nativeImportApp(file)?.id, "The intake checks linked media before writing");
  }
  for (const file of ["Slides.pptx", "Layers.psd", "Photo.jpg", "Notes", "fake.docx.exe"]) assert.equal(nativeImportApp(file), null);
  const word = studioApps.find(app => app.id === "wordcraft")!;
  assert.equal(nativeImportApp("Brief.docx", [word, {...word, id:"other"}]), null);
  assert.equal(nativeImportApp("Brief.docx", [word, {...word, id:"pending",editor:{...word.editor,status:"pending"}}])?.id,"wordcraft");
  assert.equal(nativeImportApp("Brief.docx", [{...word,workstation:{...word.workstation,status:"pending"}}]),null);
  assert.equal(nativeImportApp("Brief.docx", [{...word, editor:{...word.editor,status:"pending"}}]), null);
  assert.equal(nativeImportApp("Brief.docx", [{...word, formats:{...word.formats,verification:"pending"}}]), null);
  assert.equal(importedDocumentName("Épreuve.v2.DOCX"), "Épreuve.v2");
  assert.equal(importedDocumentName(".docx"), ".docx");
  assert.equal(importedDocumentName("a".repeat(180)+".docx").length,160);
  assert.equal(importedDocumentName("Steel.detailcraft.json"),"Steel");
  assert.equal(importedDocumentName("Site.civilcraft.json"),"Site");
  assert.equal(importedDocumentName("Assembly.partcraft-asm.json"),"Assembly");
});

test("PDF routing offers both verified applications, preserves direct intake and honors an explicit choice",()=>{
  const pdf=studioApps.find(app=>app.id==='pdfcraft')!;
  const markup={...pdf,id:'markupcraft',name:'MarkupCraft'};
  assert.deepEqual(nativeImportApps('Plan.PDF',[pdf,markup]).map(app=>app.id),['pdfcraft','markupcraft']);
  assert.equal(nativeImportApp('Plan.pdf',[pdf,markup])?.id,'pdfcraft');
  assert.equal(nativeImportApp('Plan.pdf',[pdf,markup],'markupcraft')?.id,'markupcraft');
  assert.equal(nativeImportApp('Plan.pdf',[pdf,markup],'wordcraft'),null);
  assert.equal(nativeImportApp('Plan.pdf',[pdf,{...markup,editor:{...markup.editor,status:'pending'}}],'markupcraft'),null);
});

test("published adapter master names are normalized without changing source bytes or uploading unrelated files",async()=>{
  const film=new Blob([JSON.stringify({format:"filmcraft.project",schema_version:15,project:{items:{}}})]);
  const original={path:"Scene.FCPROJ",file:film,role:"master"};
  const files=await checkNativeImport("filmcraft",[original,{path:"unrelated.txt",file:new Blob(["private"]),role:"dependency"}]);
  assert.deepEqual(files,[{...original,path:"Scene.fcproj"}]);assert.equal(files[0].file,film);assert.equal(original.path,"Scene.FCPROJ");
  const catalog=new Blob([JSON.stringify({format:"lightcraft-catalog",version:9,seq:0,catalog:{photos:{}}})]);
  const light=await checkNativeImport("lightcraft",[{path:"My catalog.snap",file:catalog,role:"master"}]);
  assert.equal(light[0].path,"catalog.snap");assert.equal(light[0].file,catalog);
});


test("MatCraft intake keeps exact selected scripts and numerical inputs and rejects binary scripts",async()=>{
  assert.equal(nativeImportApp("Study.m")?.id,"matcraft");
  assert.equal(nativeImportApp("Workspace.MAT")?.id,"matcraft");
  const script={path:"Study.m",role:"master",file:new Blob(["result = readmatrix('data/samples.csv');\n"])};
  const data={path:"data/samples.csv",role:"dependency",file:new Blob(["1,2\n3,4\n"])};
  assert.deepEqual(await checkNativeImport("matcraft",[script,data]),[script,data]);
  await assert.rejects(checkNativeImport("matcraft",[{...script,file:new Blob([new Uint8Array([0,1,2])])}]));
  await assert.rejects(checkNativeImport("matcraft",[{...script,path:"Broken.mat"}]));
});
