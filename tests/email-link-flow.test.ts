import assert from "node:assert/strict";
import test from "node:test";
import { emailLinkResponse } from "../src/lib/email-link-flow";

const token = "a".repeat(56);
const fields = new URLSearchParams({ token_hash: token, type: "invite", next: "/reset-password" });
function auth({ verified = true, signedIn = false } = {}) {
  const calls: string[] = [];
  return { calls, actions: {
    verify: async () => { calls.push("verify"); return verified; },
    exchangeCode: async () => { calls.push("exchange"); return verified; },
    hasSession: async () => { calls.push("session"); return signedIn; },
  } };
}
function post(body = fields, origin = "https://robyn.academy") {
  return new Request("https://robyn.academy/auth/callback", { method: "POST", headers: { origin }, body });
}

test("email scanner GET and HEAD requests never consume the sign-in link", async () => {
  const client = auth();
  for (const method of ["GET", "HEAD", "GET"]) {
    const result = await emailLinkResponse(new Request("https://robyn.academy/auth/callback?" + fields, { method }), client.actions);
    const target = new URL(result.headers.get("location")!);
    assert.equal(target.pathname, "/auth/confirm");
    assert.equal(target.searchParams.get("token_hash"), token);
    assert.equal(target.searchParams.get("next"), "/dashboard");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("referrer-policy"), "strict-origin");
  }
  assert.deepEqual(client.calls, []);
});

test("the creator's same-origin button POST verifies once and redirects without credentials", async () => {
  const client = auth();
  const result = await emailLinkResponse(post(), client.actions);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "https://robyn.academy/dashboard");
  assert.deepEqual(client.calls, ["verify"]);
});

test("cross-site sign-in forms cannot authenticate a browser", async () => {
  const client = auth();
  const result = await emailLinkResponse(post(fields, "https://evil.invalid"), client.actions);
  assert.equal(result.status, 403);
  assert.deepEqual(client.calls, []);
});

test("privacy-suppressed and missing origins remain blocked instead of weakening the request check", async () => {
  for (const origin of ["null", ""]) {
    const client = auth();
    const result = await emailLinkResponse(post(fields, origin), client.actions);
    assert.equal(result.status, 403);
    assert.deepEqual(client.calls, []);
  }
});

test("a reused link keeps a verified session but cannot sign in a different browser", async () => {
  for (const signedIn of [true, false]) {
    const client = auth({ verified: false, signedIn });
    const result = await emailLinkResponse(post(), client.actions);
    const target = new URL(result.headers.get("location")!);
    assert.equal(target.pathname, signedIn ? "/dashboard" : "/login");
    assert.equal(target.searchParams.has("token_hash"), false);
    assert.deepEqual(client.calls, ["verify", "session"]);
  }
});

test("unknown token types are rejected and external return URLs stay inside Robyn", async () => {
  const client = auth();
  const invalid = new URLSearchParams(fields); invalid.set("type", "admin");
  const rejected = await emailLinkResponse(post(invalid), client.actions);
  assert.equal(new URL(rejected.headers.get("location")!).pathname, "/login");
  assert.deepEqual(client.calls, ["session"]);
  const external = new URLSearchParams(fields); external.set("next", "https://evil.invalid/");
  const accepted = await emailLinkResponse(post(external), client.actions);
  assert.equal(accepted.headers.get("location"), "https://robyn.academy/dashboard");
});
