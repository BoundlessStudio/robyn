import test from "node:test";
import assert from "node:assert/strict";
import { generationPrice, generationReadiness, type GenerationOptions } from "../src/studio/media-readiness";
import { parseMediaRequest } from "../src/studio/media";

test("generation readiness is specific to the acquired model, size, duration, voice and format", () => {
  for (const service of ["blockrun-image-gen", "blockrun-tts", "treza-video"]) assert.equal(generationReadiness({service}).available, true);
  const pending: GenerationOptions[] = [
    {service:"blockrun-image-gen",settings:{model:"google/nano-banana"}},
    {service:"blockrun-image-gen",settings:{size:"1440x1440"}},
    {service:"treza-video",settings:{seconds:10}},
    {service:"treza-video",settings:{aspectRatio:"9:16"}},
    {service:"treza-video",settings:{model:"seedance-2.5"}},
    {service:"blockrun-tts",settings:{voice:"george"}},
    {service:"blockrun-tts",settings:{response_format:"wav"}},
    {service:"blockrun-tts",settings:{speed:1.2}},
    {service:"paysponge-gemini-image"}, {service:"blockrun-image-edit"}, {service:"blockrun-ai-api-v1-audio-sound-effects"},
  ];
  for (const request of pending) {
    assert.equal(generationReadiness(request).available, false);
    // Keep old syntax readable so the server can reconcile existing identity.
    const inputs=request.service==="blockrun-image-edit"?[{assetId:"00000000-0000-4000-8000-000000000001",revisionId:"00000000-0000-4000-8000-000000000002"}]:[];
    assert.doesNotThrow(()=>parseMediaRequest({operation:"generate",name:"Existing request",prompt:"A test scene",...request,inputs}));
  }
});

test("media reservations follow size/character pricing and explain catalog rounding", () => {
  assert.equal(generationPrice({service:"blockrun-image-gen",settings:{size:"1440x1440"}}).reservationMicros,22000);
  assert.equal(generationPrice({service:"blockrun-image-gen"}).reservationMicros,16750);
  assert.equal(generationPrice({service:"blockrun-tts",prompt:"x".repeat(33)}).reservationMicros,2733);
  assert.equal(generationPrice({service:"blockrun-tts",prompt:"x"}).reservationMicros,2000);
  assert.equal(generationPrice({service:"blockrun-tts",prompt:"x".repeat(1000)}).reservationMicros,53500);
  assert.equal(generationPrice({service:"blockrun-tts",prompt:"x".repeat(10000)}).reservationMicros,526000);
  assert.ok(generationPrice({service:"blockrun-tts",prompt:"😀".repeat(500)}).reservationMicros>=generationPrice({service:"blockrun-tts",prompt:"x".repeat(500)}).reservationMicros);
  const edit=generationPrice({service:"blockrun-image-edit"});assert.equal(edit.expectedMicros,53500);assert.equal(edit.reservationMicros,54000);
  const effect=generationPrice({service:"blockrun-ai-api-v1-audio-sound-effects"});assert.equal(effect.expectedMicros,53500);assert.equal(effect.reservationMicros,53501);
  assert.throws(()=>generationPrice({service:"unreviewed"}),/Unknown/);
});
