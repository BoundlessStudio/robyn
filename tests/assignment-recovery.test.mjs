import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { assignmentBrowserFixture, specialist, originalRef, journalKey } from "./helpers/assignment-browser.mjs";

test("lost assignment acknowledgements survive reloads and panel changes with the original identity, employee and inputs", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const {page,state} = await assignmentBrowserFixture(browser);
    await page.goto("https://assignment.robyn.test/");
    const brief = page.getByRole("textbox", {name:"The brief",exact:true});
    await page.getByRole("combobox", {name:"Who is this for?"}).selectOption(specialist);
    await brief.fill("Preserve this single brief and its original saved revision");
    await page.getByRole("button", {name:"Send the brief",exact:true}).click();
    await page.getByRole("alert").waitFor();
    assert.deepEqual(state.persisted[0], state.calls[0], "the full request is durable before POST");
    assert.equal(state.calls[0].employeeId, specialist);
    assert.deepEqual(state.calls[0].inputs, [originalRef]);
    await page.getByRole("button", {name:"Change open revision"}).click();
    state.allowance = 0;
    await page.goto("https://assignment.robyn.test/?different-open-revision=1");
    await page.getByText("No AI allowance remains.", {exact:false}).waitFor();
    assert.equal(await brief.inputValue(), state.calls[0].brief);
    assert.equal(await brief.getAttribute("readonly"), "");
    assert.equal(await page.getByRole("combobox").isDisabled(), true);
    await page.getByRole("button", {name:"Open included revision"}).click();
    assert.equal(await page.getByLabel("Opened revision").textContent(), originalRef.revisionId);
    await page.getByRole("button", {name:"Reconnect this brief"}).click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", {name:"Close composer"}).click();
    await page.getByRole("button", {name:"Open composer"}).click();
    await page.getByRole("button", {name:"Switch panel"}).click();
    await page.getByRole("textbox", {name:"Tell your Director what you have in mind"}).waitFor();
    await page.getByRole("button", {name:"Switch panel"}).click();
    state.acknowledge = true;
    await page.getByRole("button", {name:"Reconnect this brief"}).click();
    await page.getByText("Your brief is in the studio.").waitFor();
    assert.equal(state.calls.length, 3);
    assert.ok(state.calls.every(call => JSON.stringify(call) === JSON.stringify(state.calls[0])));
    assert.equal(state.accepted.size, 1, "only one server idempotency identity across retries");
    await page.reload();
    await brief.waitFor();
    assert.equal(await brief.inputValue(), "");
    assert.equal(await page.getByRole("button", {name:"Send the brief",exact:true}).isDisabled(), true);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending, journalKey), null);
    assert.deepEqual(state.errors, []);
  } finally { await browser.close(); }
});

test("storage failures prevent sending and a different brief requires explicit new intent", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const {page,state} = await assignmentBrowserFixture(browser);
    await page.goto("https://assignment.robyn.test/");
    const brief = page.getByRole("textbox", {name:"The brief",exact:true});
    await brief.fill("Original request");
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error("Storage full"); }; });
    await page.getByRole("button", {name:"Send the brief",exact:true}).click();
    await page.getByRole("alert").waitFor();
    assert.equal(state.calls.length, 0);
    await page.reload();
    await page.getByRole("button", {name:"Send the brief",exact:true}).click();
    await page.getByRole("alert").waitFor();
    assert.equal(state.calls.length, 1);
    await page.getByRole("button", {name:"Start a different brief"}).click();
    await brief.fill("A deliberately separate request");
    state.acknowledge = true;
    await page.getByRole("button", {name:"Send the brief",exact:true}).click();
    await page.getByText("Your brief is in the studio.").waitFor();
    assert.equal(state.accepted.size, 2);
    assert.notEqual(state.calls[0].requestId, state.calls[1].requestId);
    assert.deepEqual(state.errors, []);
  } finally { await browser.close(); }
});

test("an acknowledgement that cannot be persisted reconnects the same saved request", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const {page,state} = await assignmentBrowserFixture(browser);
    state.acknowledge = true;
    await page.goto("https://assignment.robyn.test/");
    await page.getByRole("textbox", {name:"The brief",exact:true}).fill("Preserve identity when acknowledgement cleanup fails");
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("robyn-assignment-draft:") && JSON.parse(value).pending === null) throw Error("Storage full after acknowledgement");
        return original.call(this, key, value);
      };
    });
    await page.getByRole("button", {name:"Send the brief",exact:true}).click();
    await page.getByRole("alert").waitFor();
    state.allowance = 0;
    await page.reload();
    await page.getByRole("button", {name:"Reconnect this brief"}).click();
    await page.getByText("Your brief is in the studio.").waitFor();
    assert.deepEqual(state.calls[0], state.calls[1]);
    assert.equal(state.accepted.size, 1);
    assert.deepEqual(state.errors, []);
  } finally { await browser.close(); }
});
