import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the local Mermaid editor", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mermade — Visual Mermaid Editor<\/title>/i);
  assert.match(html, /Saved locally/);
  assert.match(html, /aria-label="Canvas tools"/);
  assert.match(html, /aria-label="Canvas view"/);
  assert.match(html, /Freeform<\/button>/);
  assert.match(html, /Mermaid<\/button>/);
  assert.match(
    html,
    /aria-label="Canvas view"[\s\S]*?<button class=""[^>]*>[\s\S]*?Freeform<\/button>[\s\S]*?<button class="active"[^>]*>[\s\S]*?Mermaid<\/button>/,
  );
  assert.doesNotMatch(html, /codex-preview|chatgpt\.site|Sign in required/i);
});

test("renders discoverable toolbar shortcuts", async () => {
  const response = await render();
  const html = await response.text();

  const shortcuts = [
    ["Select", "V"],
    ["Marquee select", "M"],
    ["Add node", "N"],
    ["Link nodes", "L"],
    ["Create subgraph", "S"],
    ["Add decision", "D"],
  ];

  for (const [label, key] of shortcuts) {
    assert.match(html, new RegExp(`aria-label="${label} \\(${key}\\)"`));
    assert.match(html, new RegExp(`<kbd aria-hidden="true">${key}<\\/kbd>`));
  }

  assert.match(html, /Click to select · Double-click to edit · Scroll to pan · ⌘ scroll to zoom/);
  assert.match(html, /aria-label="Settings"/);
  assert.doesNotMatch(html, /> Share<\/button>/);
});

test("ships the approved Mermaid-pink brand assets", async () => {
  const [mark, lockup, titleCard, favicon, ogPng, faviconIco] = await Promise.all([
    readFile(new URL("../public/brand/logo-mark.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/brand/logo-lockup.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/brand/title-card.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
    readFile(new URL("../public/favicon.ico", import.meta.url)),
  ]);

  for (const svg of [mark, lockup, titleCard, favicon]) {
    assert.match(svg, /#E0095F/);
  }
  assert.match(mark, /<rect[^>]+rx="14"/);
  assert.match(mark, /<circle/);
  assert.match(mark, /M94 78 112 96 94 114 76 96Z/);
  assert.equal(ogPng.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(faviconIco.subarray(0, 4).toString("hex"), "00000100");
});

test("declares the CC BY-NC-SA 4.0 repository license", async () => {
  const [license, packageJson] = await Promise.all([
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(license, /Creative Commons Attribution-NonCommercial-ShareAlike 4\.0 International/);
  assert.equal(JSON.parse(packageJson).license, "CC-BY-NC-SA-4.0");
});
