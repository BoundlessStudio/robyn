import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";

test("studio naming backfills defaults and personalizes new studios without replacing creator choices", async () => {
  const db = await studioDatabase();
  try {
    await applyStudioMigrations(db, "0036_external_mcp_mailboxes.sql");
    const account = async email => {
      const id = randomUUID();
      await db.query("insert into auth.users(id,email) values($1,$2)", [id, email]);
      return id;
    };
    const initialize = async owner => (await db.query("select initialize_studio($1,'[]') as id", [owner])).rows[0].id;
    const name = async id => (await db.query("select name from workspaces where id=$1", [id])).rows[0].name;
    const existing = await account("samira.lee+pilot@example.test");
    const custom = await account("morgan_lake@example.test");
    const noEmail = await account(null);
    const [existingId, customId, noEmailId] = await Promise.all([existing, custom, noEmail].map(initialize));
    assert.equal(await name(existingId), "My creative studio");
    await db.query("update workspaces set name='North Star Design' where id=$1", [customId]);

    await applyStudioMigrations(db);
    assert.equal(await name(existingId), "Samira Lee's Studio");
    assert.equal(await name(customId), "North Star Design");
    assert.equal(await name(noEmailId), "My creative studio");
    const invited = await account("JORDAN-river@example.test");
    const newStudio = await initialize(invited);
    assert.equal(await name(newStudio), "Jordan River's Studio");
    await db.query("update workspaces set name='River Design' where id=$1", [newStudio]);
    assert.equal(await initialize(invited), newStudio);
    assert.equal(await name(newStudio), "River Design");

    await db.exec("set role authenticated");
    await assert.rejects(db.query("select initialize_studio($1,'[]')", [invited]), /permission denied/);
  } finally { await db.close(); }
});
