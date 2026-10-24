import assert from "node:assert/strict";
import test from "node:test";
import { authReturnPath } from "../src/lib/auth-redirect";

test("email sign-in preserves a selected document on the trusted origin", () => {
  const path = "/dashboard/projects/example?asset=one&revision=two#review";
  assert.equal(authReturnPath("https://robyn.academy" + path, "https://robyn.academy"), path);
  assert.equal(authReturnPath(path, "https://robyn.academy"), path);
});

test("email sign-in rejects external and disguised redirect destinations", () => {
  for (const path of [null, "https://evil.invalid/dashboard", "http://robyn.academy/dashboard", "https://robyn.academy.evil.invalid/", "https://robyn.academy@evil.invalid/", "//evil.invalid", "/%2f/evil.invalid", "/%5cevil.invalid", "javascript:alert(1)", "/%0a/evil.invalid"]) {
    assert.equal(authReturnPath(path, "https://robyn.academy"), "/dashboard", String(path));
  }
});

test("already-sent password setup links enter the passwordless studio", () => {
  assert.equal(authReturnPath("/reset-password", "https://robyn.academy"), "/dashboard");
  assert.equal(authReturnPath("https://robyn.academy/reset-password?old=1", "https://robyn.academy"), "/dashboard");
});
