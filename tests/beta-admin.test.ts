import test from "node:test";
import assert from "node:assert/strict";
import { hashBetaPassword, verifyBetaPassword } from "../src/lib/beta-password";

test("admin passwords have independent salted hashes and reject incorrect or malformed credentials", async () => {
  const first = await hashBetaPassword("test-admin-password"), second = await hashBetaPassword("test-admin-password");
  assert.notEqual(first, second);
  assert.equal(await verifyBetaPassword("test-admin-password", first), true);
  assert.equal(await verifyBetaPassword("incorrect-password", first), false);
  assert.equal(await verifyBetaPassword("test-admin-password", null), false);
  assert.equal(await verifyBetaPassword("test-admin-password", "invalid"), false);
  await assert.rejects(hashBetaPassword("short"));
});
