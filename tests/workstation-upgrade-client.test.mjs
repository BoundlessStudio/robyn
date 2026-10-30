import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/module.mjs";

test("Agent37 image migration sends only the explicit template and keeps legacy no-body updates", async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env.AGENT37_API_KEY;
  process.env.AGENT37_API_KEY = "fixture-control-plane-key";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json({ id: "persistent", status: "running", template: "robyn-cadcraft-new@2",
      image_ref: null, image_digest: `sha256:${"b".repeat(64)}`, template_revision: 2 });
  };
  try {
    const { agent37 } = await loadModule("../../src/lib/agent37.ts", { "server-only": "" });
    const result = await agent37.update("persistent", "robyn-cadcraft-new@2");
    assert.equal(result.id, "persistent"); assert.equal(result.template_revision, 2);
    assert.equal(requests[0].url, "https://api.agent37.com/v1/instances/persistent/update");
    assert.equal(requests[0].options.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].options.body), { template: "robyn-cadcraft-new@2" });
    assert.equal(requests[0].options.headers.Authorization, "Bearer fixture-control-plane-key");
    assert.equal(requests[0].options.headers["X-Agent37-Key"], undefined);
    await agent37.update("persistent");
    assert.equal(Object.hasOwn(requests[1].options, "body"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.AGENT37_API_KEY; else process.env.AGENT37_API_KEY = previousKey;
  }
});
