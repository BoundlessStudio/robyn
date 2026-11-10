import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { nativeImportFixture, origin, projectId } from "./fixtures/native-import.mjs";

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
    await page.getByRole("link", { name: "Profile", exact: true }).click();
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
