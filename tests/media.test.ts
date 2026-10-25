import test from "node:test";
import assert from "node:assert/strict";
import { estimatedMediaCost,parseMediaRequest, parseMediaSearch, permittedMediaUrl, publicMediaJob, type MediaJob } from "../src/studio/media";
import { commonsLicense, normalizeCommons } from "../src/studio/media-commons";

const uuid = "4b310386-ef7c-4d5c-8f3c-5502494fb774";
test("media requests use system estimates, supported services and exact source revisions", () => {
  const input = { operation: "generate", service: "treza-video", name: "Ocean", prompt: "An ocean wave", maxCostMicros: 500000, settings: { seconds: 5, aspectRatio: "16:9" } };
  assert.equal(parseMediaRequest(input).kind, "video");
  for (const change of [{ service: "arbitrary-vendor" }, { settings: { image: "https://untrusted.test/" } }, { settings: { seconds: 90 } }, { prompt: " " }]) assert.throws(() => parseMediaRequest({ ...input, ...change }));
  assert.equal(parseMediaRequest({...input,maxCostMicros:99999999}).maxCostMicros,0,"caller prices cannot authorize spend");
  assert.equal(estimatedMediaCost(parseMediaRequest(input)),420000);
  assert.equal(estimatedMediaCost(parseMediaRequest({...input,service:"blockrun-image-gen",settings:{}})),16750);
  assert.ok(estimatedMediaCost(parseMediaRequest({...input,settings:{seconds:15,model:"seedance-2.5"}}))>420000);
  assert.throws(() => parseMediaRequest({ ...input, inputs: [{ assetId: uuid, revisionId: uuid }] }), /do not accept reference/);
  assert.throws(() => parseMediaRequest({ ...input, service: "blockrun-image-edit", settings: {} }), /needs one/);
  assert.equal(parseMediaRequest({ ...input, service: "blockrun-image-edit", settings: {}, inputs: [{ assetId: uuid, revisionId: uuid }] }).inputs[0].revisionId, uuid);
  assert.throws(() => parseMediaRequest({ ...input, service: "blockrun-tts", settings: { response_format: "pcm" } }), /Unsupported/);
  assert.throws(() => parseMediaRequest({ operation: "import", provider: "commons", name: "A source", kind: "image", discoveryId: "https://arbitrary.test/image.png" }));
  assert.equal(parseMediaRequest({ operation: "import", provider: "commons", name: "A source", kind: "image", discoveryId: uuid, maxCostMicros: 999999 }).maxCostMicros, 0);
});
test("media URLs cannot import arbitrary hosts, credentials, ports, or insecure URLs", () => {
  assert.equal(permittedMediaUrl("https://upload.wikimedia.org/a.png", "commons"), "https://upload.wikimedia.org/a.png");
  for (const url of ["http://upload.wikimedia.org/a", "https://upload.wikimedia.org.evil.test/a", "https://127.0.0.1/a", "https://user:password@upload.wikimedia.org/a", "https://upload.wikimedia.org:8443/a", "file:///secret"]) assert.throws(() => permittedMediaUrl(url, "commons"));
  assert.throws(() => permittedMediaUrl("https://other.supabase.co/file", "storage", "https://owned.supabase.co"));
});
test("search is bounded and job responses expose no internal provider data or unfinished assets", () => {
  assert.equal(parseMediaSearch({ kind: "sound_effect", query: "Rain", page: 1 }).query, "Rain");
  assert.throws(() => parseMediaSearch({ kind: "video", query: " " }));
  const job = { id: uuid, name: "A clip", provider: "perflo", kind: "video", state: "uploading", reserved_micros: 500000, actual_micros: null, billing_settled: false, asset_id: uuid, revision_id: uuid, provider_metadata: { secret: "internal" } } as unknown as MediaJob;
  const publicJob = publicMediaJob(job);
  assert.equal(publicJob.ref, null);
  assert.equal(publicJob.actualMicros, null);
  assert.equal("provider_metadata" in publicJob, false);
  assert.equal(publicMediaJob({ ...job, state: "completed" }).ref?.revisionId, uuid);
});
test("Commons rights normalize CC0/BY only and identify generic Ogg containers without accepting video as audio", () => {
  for(const url of ["http://creativecommons.org/licenses/by/3.0","https://creativecommons.org/licenses/by/4.0/","https://creativecommons.org/publicdomain/zero/1.0/deed.en"])assert.ok(commonsLicense(url));
  for(const url of ["https://creativecommons.org/licenses/by-sa/4.0/","https://creativecommons.org/licenses/by-nc/4.0/","https://creativecommons.org/licenses/by-nd/4.0/","https://creativecommons.org.evil.test/licenses/by/4.0/"])assert.equal(commonsLicense(url),null);
  const info={url:"https://upload.wikimedia.org/rain.ogg",descriptionurl:"https://commons.wikimedia.org/wiki/File:Rain.ogg",mime:"application/ogg",mediatype:"AUDIO",sha1:"a".repeat(40),timestamp:"2026-10-24",extmetadata:{LicenseUrl:{value:"http://creativecommons.org/publicdomain/zero/1.0/deed.en"},Artist:{value:"<b>Creator</b>"},Credit:{value:"Museum recording"},Attribution:{value:"Credit the original recordist"}}};
  const page={pageid:123,lastrevid:456,title:"File:Rain.ogg",videoinfo:[info]};
  const record=normalizeCommons(page,"sound_effect");
  assert.equal(record?.creator,"Creator");assert.equal(record?.sourceRevision,456);assert.equal(record?.license,"cc0");
  assert.match(record!.attribution,/Museum recording/);assert.match(record!.attribution,/Credit the original recordist/);
  assert.equal(normalizeCommons({...page,videoinfo:[{...info,mediatype:"VIDEO"}]},"sound_effect"),null);
  assert.equal(normalizeCommons({...page,videoinfo:[{...info,extmetadata:{LicenseUrl:{value:"https://creativecommons.org/licenses/by/4.0/"}}}]},"sound_effect"),null,"BY requires an identified creator");
});
