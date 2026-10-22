import test from "node:test";
import assert from "node:assert/strict";
import { parseInvitationRequest } from "../src/lib/invitation-request";
import { safeNextPath } from "../src/lib/site-url";
import { hasSameOrigin } from "../src/lib/request-origin";

test("invitation records normalize identity without accepting absent consent", () => {
  assert.deepEqual(parseInvitationRequest({ email: "  Creator@Example.com ", craft: " Film ", consent: true }), { email: "creator@example.com", craft: "Film", consent: true });
  for (const consent of [false, "true", null, undefined]) assert.throws(() => parseInvitationRequest({ email: "creator@example.com", consent }));
});

test("public invitation boundary rejects malformed and oversized inputs", () => {
  for (const email of ["a@", "<script>", "a b@example.com", "a".repeat(250) + "@example.com"]) assert.throws(() => parseInvitationRequest({ email, consent: true }));
  assert.throws(() => parseInvitationRequest({ email: "a@example.com", consent: true, craft: "x".repeat(281) }));
  assert.throws(() => parseInvitationRequest({ email: "a@example.com", consent: true, website: "https://spam.invalid" }));
  assert.throws(() => parseInvitationRequest(null));
  assert.throws(() => parseInvitationRequest([]));
});

test("post-auth navigation cannot redirect to a different origin", () => {
  for (const path of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%5cevil.invalid", "/%2fevil.invalid", "/%0a/evil.invalid", "/%xx"]) assert.equal(safeNextPath(path), "/dashboard", path);
  assert.equal(safeNextPath("/dashboard/projects?view=recent"), "/dashboard/projects?view=recent");
});

test("origin validation respects the actual host behind the local Next proxy", () => {
  const request = (origin: string, host = "127.0.0.1:3000", extra = {}) => new Request("http://localhost:3000/api/invite-requests", { headers: { origin, host, ...extra } });
  assert.equal(hasSameOrigin(request("http://127.0.0.1:3000")), true);
  assert.equal(hasSameOrigin(request("https://evil.invalid")), false);
  assert.equal(hasSameOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000", { "sec-fetch-site": "cross-site" })), false);
  assert.equal(hasSameOrigin(request("https://evil.invalid", "127.0.0.1:3000", { "x-forwarded-host": "evil.invalid" })), false);
  assert.equal(hasSameOrigin(request("null")), false);
});
