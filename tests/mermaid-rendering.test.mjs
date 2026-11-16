import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const loadRenderingHelpers = () => loadTypeScript(new URL("../app/mermaid-rendering.ts", import.meta.url));

test("maps rendered labels back to statements in flowcharts", async () => {
  const { createRenderedLabelResolver } = await loadRenderingHelpers();
  const examples = [
    ['flowchart LR\n A[Start] --> B[Finish]', "Start", 1],
    ['graph TD\n A[First]\n B[Second]', "Second", 2],
  ];

  for (const [source, label, expectedLine] of examples) {
    assert.equal(createRenderedLabelResolver(source)(label), expectedLine, label);
  }
});

test("does not bind short or unrelated SVG text to an arbitrary statement", async () => {
  const { createRenderedLabelResolver } = await loadRenderingHelpers();
  const source = "flowchart LR\n  A[Start] --> B[Finish]";
  assert.equal(createRenderedLabelResolver(source)("A"), -1);
  assert.equal(createRenderedLabelResolver(source)("Missing"), -1);
});

test("repeated rendered labels consume matching source lines in order and reuse the first when exhausted", async () => {
  const { createRenderedLabelResolver } = await loadRenderingHelpers();
  const resolve = createRenderedLabelResolver('flowchart LR\n %% repeated comment\n A["Repeated <b>label</b>"] --> B\n C[Repeated label]\n D[Other label]');
  assert.equal(resolve("Repeated label"), 2);
  assert.equal(resolve(" Other   label "), 4);
  assert.equal(resolve("repeated label"), 3);
  assert.equal(resolve("Repeated label"), 2);
  assert.equal(resolve("Missing"), -1);
});
