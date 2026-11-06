import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { loadModule } from "./helpers/module.mjs";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";

test("OAuth dynamic registration and consent exchange survive the passwordless return path", async () => {
  const db = await studioDatabase();
  const issuer = "https://robyn.example";
  const resource = issuer + "/mcp";
  const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
  const owner = randomUUID();
  const previous = { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, ROBYN_MCP_RUNTIME_SECRET: process.env.ROBYN_MCP_RUNTIME_SECRET };
  process.env.NEXT_PUBLIC_SITE_URL = issuer;
  process.env.ROBYN_MCP_RUNTIME_SECRET = "a".repeat(43);
  try {
    await db.exec("alter table auth.users add column banned_until timestamptz");
    await applyStudioMigrations(db);
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [owner]);
    const api = {
      async rpc(name, args) {
        const values = Object.values(args).map(value => Array.isArray(value) && name !== "register_studio_mcp_client" ? JSON.stringify(value) : value);
        const { rows } = await db.query(`select ${name}(${values.map((_, index) => "$" + (index + 1)).join(",")}) as data`, values);
        return { data: rows[0].data, error: null };
      },
      from(table) {
        const clauses = [], values = [];
        const query = {
          select: () => query,
          eq(key, value) { clauses.push(`${key}=$${values.push(value)}`); return query; },
          async maybeSingle() {
            const { rows } = await db.query(`select * from ${table} where ${clauses.join(" and ")}`, values);
            return { data: rows[0] ?? null, error: null };
          },
          single: () => query.maybeSingle(),
          async insert(row) {
            await db.query(`insert into ${table}(${Object.keys(row).join(",")}) values(${Object.keys(row).map((_, i) => "$" + (i + 1)).join(",")})`, Object.values(row));
            return { error: null };
          },
        };
        return query;
      },
    };
    globalThis.__mcpOAuthFixture = { api, owner };
    const mocks = {
      "server-only": "",
      "@/lib/supabase/admin": "export const createAdminClient=()=>globalThis.__mcpOAuthFixture.api;",
      "@/lib/auth": "export const requireUser=async()=>({db:globalThis.__mcpOAuthFixture.api,user:{id:globalThis.__mcpOAuthFixture.owner}});",
    };
    const [{ POST }, { GET: discovery }, { emailLinkResponse }] = await Promise.all([
      loadModule("../../src/app/api/studio/mcp-oauth/[action]/route.ts", mocks),
      loadModule("../../src/app/.well-known/oauth-authorization-server/route.ts", mocks),
      loadModule("../../src/lib/email-link-flow.ts", {}),
    ]);
    const metadata = await discovery().json();
    assert.equal(metadata.issuer, issuer);
    assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
    const submit = (action, fields, origin) => POST(new Request(issuer + "/api/studio/mcp-oauth/" + action, {
      method: "POST", headers: { "Content-Type": fields instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json",
        ...(origin ? { Origin: origin } : {}) },
      body: fields instanceof URLSearchParams ? fields : JSON.stringify(fields),
    }), { params: Promise.resolve({ action }) });
    const registration = await submit("register", { client_name: "ChatGPT", redirect_uris: [callback], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
    assert.equal(registration.status, 201);
    const { client_id } = await registration.json();
    const verifier = "v".repeat(43);
    const fields = new URLSearchParams({
      client_id, redirect_uri: callback, state: "one&two", resource, response_type: "code", scope: "studio:mcp",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    });
    const returnTo = issuer + "/oauth/authorize?" + fields;
    const email = new URL(issuer + "/auth/callback");
    email.search = new URLSearchParams({ token_hash: "m".repeat(64), type: "email", next: returnTo }).toString();
    let redeemed = 0;
    const auth = { verify: async () => { redeemed++; return true; }, exchangeCode: async () => false, hasSession: async () => false };
    const confirmation = await emailLinkResponse(new Request(email), auth);
    assert.equal(redeemed, 0);
    const confirm = new URL(confirmation.headers.get("location"));
    assert.equal(confirm.pathname, "/auth/confirm");
    const continued = await emailLinkResponse(new Request(issuer + "/auth/callback", {
      method: "POST", headers: { origin: issuer, "Content-Type": "application/x-www-form-urlencoded" }, body: confirm.searchParams,
    }), auth);
    assert.equal(continued.headers.get("location"), returnTo);
    assert.equal(redeemed, 1);
    fields.set("decision", "allow");
    assert.equal((await submit("authorize", fields, "https://untrusted.example")).status, 403);
    const rejectedRedirect = new URLSearchParams(fields);
    rejectedRedirect.set("redirect_uri", "https://untrusted.example/callback");
    assert.equal((await submit("authorize", rejectedRedirect, issuer)).status, 400);
    const approved = await submit("authorize", fields, issuer);
    assert.equal(approved.status, 303);
    const target = new URL(approved.headers.get("location"));
    assert.equal(target.origin + target.pathname, callback);
    assert.equal(target.searchParams.get("iss"), issuer);
    assert.equal(target.searchParams.get("state"), "one&two");
    const grant = new URLSearchParams({ grant_type: "authorization_code", code: target.searchParams.get("code"),
      client_id, resource, redirect_uri: callback, code_verifier: verifier });
    const badPkce = new URLSearchParams(grant);
    badPkce.set("code_verifier", "x".repeat(43));
    assert.equal((await submit("token", badPkce)).status, 400);
    const response = await submit("token", grant);
    assert.equal(response.status, 200);
    const { access_token, refresh_token } = await response.json();
    assert.match(access_token, /^rbm_/);
    assert.match(refresh_token, /^rbr_/);
    assert.equal((await submit("token", grant)).status, 400);
    const { rows: [stored] } = await db.query("select access_hash,refresh_hash,resource from studio_mcp_grants");
    assert.equal(stored.access_hash, createHash("sha256").update(access_token).digest("hex"));
    assert.equal(stored.resource, resource);
  } finally {
    delete globalThis.__mcpOAuthFixture;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.close();
  }
});
