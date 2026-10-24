// The component test process uses the import condition for Streamdown's ESM export.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/Markdown";

const render = (content: string, streaming = false) => renderToStaticMarkup(createElement(Markdown, {
  content, mode: streaming ? "streaming" : "static", isAnimating: streaming,
}));

test("saved employee notes render real lists, emphasis and native revision IDs", () => {
  const id = "a786aba3-1ed9-4027-bd85-38b235f0c1b9";
  const html = render(`Completed and saved a new revision.\n\n- **Asset:** \`${id}\`\n- **Verified:** Preserved the *editable* document.`);
  assert.match(html, /<ul\b/);
  assert.equal((html.match(/<li\b/g) ?? []).length, 2);
  assert.match(html, /data-streamdown="strong">Asset:<\/span>/);
  assert.match(html, new RegExp(`<code[^>]*>${id}<\/code>`));
  assert.match(html, /<em[^>]*>editable<\/em>/);
  assert.doesNotMatch(html, /\*\*Asset:\*\*/);
});

test("AI Markdown supports headings, tables, task lists, quotes, links and fenced code", () => {
  const html = render("## Findings\n\n> Keep the source.\n\n| Tool | Ready |\n| --- | --- |\n| WordCraft | Yes |\n\n- [x] Saved\n\n~~Draft~~ [Source](https://example.com/source)\n\n```js\nconst ready = true;\n```");
  for (const tag of ["h2", "blockquote", "table", "thead", "tbody", "th", "td", "del", "pre", "code"]) assert.match(html, new RegExp(`<${tag}\\b`), tag);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /data-streamdown="link"[^>]*>Source<\/button>/);
  assert.match(html, /const ready = true;/);
});

test("live AI output renders incomplete Markdown without exposing formatting markers", () => {
  const html = render("The **saved direction", true);
  assert.match(html, /data-streamdown="strong">saved direction<\/span>/);
  assert.doesNotMatch(html, /\*\*saved direction/);
});

test("AI Markdown cannot create script elements or executable links", () => {
  const html = render('<script>alert(1)</script>\n\n[Run](javascript:alert%281%29)\n\n<img src="x" onerror="alert(1)">');
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /(?:href|src)="javascript:/i);
  assert.doesNotMatch(html, /onerror\s*=/i);
});
