import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("the installed ELK renderer omits DOM-backed fields from serialisation", async () => {
  const rendererDirectory = new URL("../node_modules/@mermaid-js/layout-elk/dist/chunks/mermaid-layout-elk.core/", import.meta.url);
  const rendererFiles = (await readdir(rendererDirectory)).filter((name) => /^render-.*\.mjs$/.test(name));
  const rendererSources = await Promise.all(rendererFiles.map((name) => readFile(new URL(name, rendererDirectory), "utf8")));
  const renderer = rendererSources.find((source) => source.includes("elkGraph"));

  assert.ok(renderer, "the installed ELK renderer must be present");

  assert.match(renderer, /\[ELK graph omitted\]/);
  assert.match(renderer, /ELK DOM fields omitted/);
  assert.doesNotMatch(renderer, /JSON\.stringify\(elkGraph, null, 2\)/);
  assert.doesNotMatch(renderer, /JSON\.parse\(JSON\.stringify\(node\)\)/);
});

test("the compatibility patch covers Mermaid and the external ELK package", async () => {
  const patchScript = await readFile(new URL("../scripts/patch-mermaid-block-renderer.mjs", import.meta.url), "utf8");

  assert.match(patchScript, /node_modules\/@mermaid-js\/layout-elk\/dist/);
  assert.match(patchScript, /JSON\.stringify\(elkGraph, null, 2\)/);
  assert.match(patchScript, /key === "domId" \|\| key === "labelNode"/);
});
