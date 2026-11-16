import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const loadRenderingHelpers = () => loadTypeScript(new URL("../app/mermaid-rendering.ts", import.meta.url));

test("maps rendered labels back to statements in flowcharts", async () => {
  const { sourceLineForRenderedText } = await loadRenderingHelpers();
  const examples = [
    ['flowchart LR\n A[Start] --> B[Finish]', "Start", 1],
    ['graph TD\n A[First]\n B[Second]', "Second", 2],
  ];

  for (const [source, label, expectedLine] of examples) {
    assert.equal(sourceLineForRenderedText(source, label), expectedLine, label);
  }
});

test("does not bind short or unrelated SVG text to an arbitrary statement", async () => {
  const { sourceLineForRenderedText } = await loadRenderingHelpers();
  const source = "flowchart LR\n  A[Start] --> B[Finish]";
  assert.equal(sourceLineForRenderedText(source, "A"), -1);
  assert.equal(sourceLineForRenderedText(source, "Missing"), -1);
});
