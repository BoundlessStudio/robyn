import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { nativeImportFixture, origin, projectId, selectStudioMenuItem } from "./fixtures/native-import.mjs";

test("Profile manages both providers and a brief retries with its original mailbox", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, state } = await nativeImportFixture(browser, { initialPath: "/dashboard" });
    await page.route("https://connect.composio.dev/link/fixture-*", async route => {
      const provider = new URL(route.request().url()).pathname.split("-").at(-1);
      const connection = state.mailConnections.find(item => item.provider === provider);
      assert.equal(connection.status, "pending");
      connection.status = "active";
      await route.fulfill({ contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(origin + "/dashboard/profile?mail=return") + ")</script>" });
    });
    await selectStudioMenuItem(page, "Profile");
    const mail = page.getByRole("region", { name: "Connected mail" });
    await mail.getByRole("button", { name: "Connect Gmail", exact: true }).click();
    await mail.getByRole("link", { name: /Open Gmail Drafts/ }).waitFor();
    await mail.getByRole("button", { name: "Connect Microsoft 365", exact: true }).click();
    await mail.getByRole("link", { name: /Open Microsoft 365 Drafts/ }).waitFor();
    assert.equal(new URL(page.url()).search, "");
    assert.deepEqual(state.mailConnections.map(item => item.provider), ["gmail", "outlook"]);

    await page.goto(origin + "/dashboard/projects/" + projectId + "/employees");
    const mailbox = page.getByLabel("Mailbox for this brief");
    await mailbox.waitFor();
    assert.equal(await mailbox.inputValue(), "");
    await mailbox.selectOption("ca_fixture_outlook");
    await page.getByLabel("Your idea", { exact: true }).fill("Prepare a review draft.");
    state.failAssignmentReply = true;
    await page.getByRole("button", { name: "Make a first draft", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Reconnect the saved request" }).waitFor();
    const post = () => state.requests.filter(item => item.path === "/api/studio/assignments" && item.method === "POST");
    assert.equal(post()[0].input.mailConnectionId, "ca_fixture_outlook");
    state.failAssignmentReply = false;
    await page.reload();
    await page.getByText("Mailbox included in the saved brief.").waitFor();
    await page.getByRole("button", { name: "Reconnect this brief" }).click();
    await page.getByText("Robyn is taking it from here.", { exact: false }).waitFor();
    assert.deepEqual(post().map(item => item.input), [post()[0].input, post()[0].input]);
    assert.equal(state.assignments.size, 1);
    assert.equal(await mailbox.inputValue(), "");

    await page.goto(origin + "/dashboard/profile");
    await mail.getByRole("button", { name: /^Disconnect Gmail/ }).click();
    await mail.getByRole("button", { name: "Connect Gmail", exact: true }).waitFor();
    await mail.getByRole("link", { name: /Open Gmail Drafts/ }).waitFor({ state: "detached" });
    assert.deepEqual(state.mailConnections.map(item => item.provider), ["outlook"]);
  } finally { await browser.close(); }
});

test("Connected mail groups clear provider status and the available actions", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, state } = await nativeImportFixture(browser, { initialPath: "/dashboard/profile", viewport: { width: 1366, height: 850 } });
    const mail = page.getByRole("region", { name: "Connected mail" });
    const gmail = mail.getByRole("group", { name: "Gmail", exact: true });
    const microsoft = mail.getByRole("group", { name: "Microsoft 365", exact: true });
    await gmail.getByText("Not connected", { exact: true }).waitFor();
    await microsoft.getByText("Not connected", { exact: true }).waitFor();
    await gmail.getByRole("button", { name: "Connect Gmail", exact: true }).waitFor();
    await microsoft.getByRole("button", { name: "Connect Microsoft 365", exact: true }).waitFor();
    assert.equal(await mail.getByRole("button", { name: "Refresh connections" }).count(), 0);

    state.mailConnections.push(
      { id: "ca_qa_gmail", provider: "gmail", status: "pending" },
      { id: "ca_qa_microsoft", provider: "outlook", status: "active" },
    );
    await page.reload();
    await gmail.getByText("Sign-in pending", { exact: true }).waitFor();
    await gmail.getByRole("button", { name: /^Cancel sign-in Gmail/ }).waitFor();
    assert.equal(await gmail.getByRole("button", { name: "Connect Gmail", exact: true }).count(), 0);
    await microsoft.getByText("Connected", { exact: true }).waitFor();
    await microsoft.getByRole("link", { name: "Open Microsoft 365 Drafts" }).waitFor();
    state.mailConnections[0].status = "active";
    await mail.getByRole("button", { name: "Refresh connections" }).click();
    await gmail.getByText("Connected", { exact: true }).waitFor();
    await gmail.getByRole("link", { name: "Open Gmail Drafts" }).waitFor();
  } finally { await browser.close(); }
});

test("MailCraft stays locked until an owned mailbox becomes active", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const bundle = "https://mailcraft-fixture.test/index.html";
    const { page, state } = await nativeImportFixture(browser, {
      initialPath: "/dashboard/profile?mailcraftBundle=" + encodeURIComponent(bundle),
    });
    await page.route(bundle, route => route.fulfill({ contentType: "text/html", body: "<title>Transport fixture</title>" }));
    const locked = page.getByText("Connect Gmail or Microsoft 365 in Profile to open MailCraft.", { exact: true });
    const open = page.getByRole("button", { name: "Open in MailCraft", exact: true });
    await locked.waitFor();
    assert.equal(await open.count(), 0);
    state.mailConnections = [{ id: "ca_pending_mailcraft", provider: "outlook", status: "pending" }];
    await page.reload();
    await page.getByText("Sign-in pending", { exact: true }).waitFor();
    assert.equal(await open.count(), 0);
    for (const provider of ["gmail", "outlook"]) {
      state.mailConnections = [{ id: "ca_active_mailcraft", provider, status: "active" }];
      await page.reload();
      await open.click();
      const frame = page.locator('iframe[title="Connected MailCraft"]');
      await frame.waitFor();
      const source = new URL(await frame.getAttribute("src"));
      const binding = new URLSearchParams(source.hash.slice(1));
      assert.equal(binding.get("mailcraft"), provider);
      assert.equal(binding.get("parentOrigin"), origin);
      assert.equal(source.href.includes("ca_active_mailcraft"), false);
      await page.getByRole("button", { name: "Back to Profile" }).click();
    }
    state.mailConnections[0].status = "unavailable";
    await page.getByRole("button", { name: "Refresh connections" }).click();
    await locked.waitFor();
    assert.equal(await open.count(), 0);
  } finally { await browser.close(); }
});

test("The project launcher and direct links require an active MailCraft connection", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, state } = await nativeImportFixture(browser);
    const tile = page.getByRole("button", { name: /^MailCraft / });
    const locked = tile.getByText("Connect Gmail or Microsoft 365 in Profile to open MailCraft.", { exact: true });
    await locked.waitFor();
    assert.equal(await tile.isDisabled(), true);

    state.mailConnections = [{ id: "ca_launcher_mailcraft", provider: "outlook", status: "active" }];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await tile.getByText("Empty portable mailbox", { exact: true }).waitFor();
    assert.equal(await tile.isEnabled(), true);

    state.mailConnections[0].status = "unavailable";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await locked.waitFor();
    assert.equal(await tile.isDisabled(), true);

    await page.goto(origin + "/dashboard/projects/" + projectId + "?app=mailcraft&launch=" + randomUUID());
    await page.getByRole("alert").filter({ hasText: "Connect Gmail or Microsoft 365" }).waitFor();
    assert.equal(state.requests.some(request => request.path === "/api/studio/starters" && request.method === "POST"), false);
  } finally { await browser.close(); }
});
