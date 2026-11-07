import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";
import { loadModule } from "./helpers/module.mjs";

test("ChatGPT attachments are confirmed as exact image assets or file collections before download", async t => {
  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.example";
  t.after(() => {
    if (storageUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = storageUrl;
  });
  const db = await studioDatabase();
  t.after(() => db.close());
  await db.exec("alter table auth.users add column banned_until timestamptz");
  await applyStudioMigrations(db);
  const userId = randomUUID(), grantId = randomUUID(), projectId = randomUUID(), otherProject = randomUUID();
  await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now())", [userId]);
  const { workspaceId } = (await db.query('select initialize_studio($1,\'[]\') as "workspaceId"', [userId])).rows[0];
  await db.query("insert into studio_projects(id,workspace_id,created_by,name) values ($1,$3,$4,'Assets'),($2,$3,$4,'Other')",
    [projectId, otherProject, workspaceId, userId]);
  const { clientId } = (await db.query('select register_studio_mcp_client(\'test\',array[\'https://client.example/callback\'],\'none\',null) as "clientId"')).rows[0];
  await db.query(`insert into studio_mcp_grants(id,client_id,user_id,workspace_id,resource,access_hash,refresh_hash)
    values ($1,$2,$3,$4,'https://robyn.example/mcp','access','refresh')`, [grantId, clientId, userId, workspaceId]);
  await db.exec("set role service_role");

  const stored = new Map();
  const downloads = new Map();
  let uploads = 0;
  let pauseUpload = 2;
  const storage = {
    async info(key) {
      return { data: stored.has(key) ? { size: stored.get(key).length } : null, error: null };
    },
    async createSignedUploadUrl(key, options) {
      assert.equal(options.upsert, false);
      return { data: { token: key }, error: null };
    },
    async uploadToSignedUrl(key, token, file, options) {
      assert.equal(token, key);
      assert.equal(options.upsert, false);
      if (++uploads === pauseUpload) return { error: { message: "Upload interrupted" } };
      assert.equal(stored.has(key), false, "completed uploads are reused");
      stored.set(key, Buffer.from(await file.arrayBuffer()));
      return { error: null };
    },
    async createSignedUrl(key, seconds, options) {
      assert.equal(seconds, 300);
      const signedUrl = "https://storage.example/" + randomUUID();
      downloads.set(signedUrl, { key, filename: options.download });
      return { data: { signedUrl }, error: null };
    },
  };
  const api = {
    storage: { from: bucket => { assert.equal(bucket, "studio-assets"); return storage; } },
    async rpc(name, args) {
      assert.match(name, /^(?:begin_studio_mcp_asset_import|assert_studio_upload_open|commit_studio_mcp_asset_import|rename_studio_mcp_asset)$/);
      const params = Object.entries(args);
      try {
        const { rows } = await db.query(`select public.${name}(${params.map(([key], index) => `${key} => $${index + 1}`).join(",")}) as value`,
          params.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value));
        return { data: rows[0].value, error: null };
      } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    },
    from(table) {
      assert.match(table, /^(?:studio_projects|studio_assets|studio_revisions|studio_package_files)$/);
      const filters = [], values = [];
      let order = "";
      const read = async () => (await db.query(`select * from ${table} where ${filters.join(" and ")}${order}`, values)).rows;
      const query = {
        select: () => query,
        eq(key, value) {
          const column = key === "provenance->>mcpImportHash" ? "provenance->>'mcpImportHash'" : key;
          assert.match(column, /^(?:[a-z_]+|provenance->>'mcpImportHash')$/);
          filters.push(`${column}=$${values.push(value)}`);
          return query;
        },
        order(key) { assert.equal(key, "path"); order = " order by path"; return query; },
        async maybeSingle() { return { data: (await read())[0] ?? null, error: null }; },
        then(resolve, reject) { return read().then(data => ({ data, error: null })).then(resolve, reject); },
      };
      return query;
    },
  };
  const identity = { db: api, workspaceId, userId, grantId };
  const mocks = { "server-only": "" };
  const { importAssets } = await loadModule("../../src/studio/mcp/asset-import.ts", mocks);
  const { renameAsset, downloadAsset } = await loadModule("../../src/studio/mcp/library.ts", mocks);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
  const sha256 = createHash("sha256").update(png).digest("hex");
  const imageUrl = "https://files.oaiusercontent.com/generated";
  const textUrl = "https://files.oaiusercontent.com/empty";
  const cdnFetches = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = String(input);
    if (downloads.has(url)) return new Response(stored.get(downloads.get(url).key));
    cdnFetches.push(url);
    assert.equal(options.redirect, "error");
    if (url.startsWith(imageUrl) && !url.endsWith("?expired")) return new Response(png, { headers: { "Content-Length": String(png.length) } });
    if (url === textUrl) return new Response(null, { headers: { "Content-Length": "0", "Content-Disposition": 'attachment; filename="Notes.txt"' } });
    return new Response(null, { status: 403 });
  });

  const generated = { projectId, creationId: randomUUID(), files: [{ file_id: "file_generated", download_url: imageUrl }] };
  await assert.rejects(importAssets(identity, generated), { code: "attachment_upload_pending" });
  const pending = (await db.query("select current_revision_id from studio_assets where id=$1", [generated.creationId])).rows[0];
  assert.equal(pending.current_revision_id, null);
  const saved = await importAssets(identity, { ...generated, files: [{ ...generated.files[0], download_url: imageUrl + "?fresh" }] });
  assert.equal(saved.status, "committed");
  assert.equal(saved.ref.assetId, generated.creationId);
  assert.equal(uploads, 3);
  const savedFiles = (await db.query("select path,mime_type,sha256 from studio_package_files where revision_id=$1 order by path", [saved.ref.revisionId])).rows;
  assert.deepEqual(savedFiles, ["attachment-1.png", "exports/attachment-1.png"].map(path => ({ path, mime_type: "image/png", sha256 })));
  const renamed = await renameAsset(identity, { projectId, assetId: saved.ref.assetId, name: "Concept study" });
  assert.equal(renamed.kind, "image");
  assert.equal(renamed.name, "Concept study");
  assert.deepEqual(renamed.ref, saved.ref);
  await assert.rejects(renameAsset(identity, { projectId: otherProject, assetId: saved.ref.assetId, name: "Wrong project" }), { code: "not_found" });
  const raw = await downloadAsset(identity, { projectId, ...saved.ref });
  assert.equal(raw.path, "attachment-1.png");
  assert.equal(raw.sha256, sha256);
  assert.equal(raw.mimeType, "image/png");
  assert.equal(downloads.get(raw.downloadUrl).filename, "attachment-1.png");
  assert.deepEqual(Buffer.from(await (await fetch(raw.downloadUrl)).arrayBuffer()), png);
  await assert.rejects(downloadAsset(identity, { projectId: otherProject, ...saved.ref }), { code: "not_found" });
  assert.deepEqual(await importAssets(identity, { ...generated, files: [{ ...generated.files[0], download_url: imageUrl + "?expired" }] }), saved);
  assert.equal(cdnFetches.length, 2, "a confirmed import replays even after the attachment URL expires");

  pauseUpload = 0;
  const collection = await importAssets(identity, { projectId, creationId: randomUUID(), name: "Client References",
    files: [{ file_id: "file_image", file_name: "Original.png", mime_type: "image/png", download_url: imageUrl },
      { file_id: "file_empty", download_url: textUrl }] });
  assert.equal(collection.status, "committed");
  await assert.rejects(downloadAsset(identity, { projectId, ...collection.ref }), { code: "file_path_required" });
  const original = await downloadAsset(identity, { projectId, ...collection.ref, path: "Original.png" });
  assert.deepEqual(Buffer.from(await (await fetch(original.downloadUrl)).arrayBuffer()), png);
  const empty = await downloadAsset(identity, { projectId, ...collection.ref, path: "Notes.txt" });
  assert.equal(empty.bytes, 0);

  const untrusted = { ...generated, creationId: randomUUID(), files: [{ file_id: "file_unknown", download_url: "https://files.oaiusercontent.com.example.org/file" }] };
  const fetchCount = cdnFetches.length;
  await assert.rejects(importAssets(identity, untrusted), { code: "invalid_attachment_url" });
  assert.equal(cdnFetches.length, fetchCount);
  await db.query("update studio_mcp_grants set revoked_at=now() where id=$1", [grantId]);
  await assert.rejects(importAssets(identity, generated), { code: "not_found" });
  await assert.rejects(renameAsset(identity, { projectId, assetId: saved.ref.assetId, name: "Revoked" }), { code: "not_found" });
});
