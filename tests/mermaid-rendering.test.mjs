import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadRenderingHelpers() {
  const source = await readFile(new URL("../app/mermaid-rendering.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("maps rendered labels back to statements across Mermaid diagram families", async () => {
  const { sourceLineForRenderedText } = await loadRenderingHelpers();
  const examples = [
    ["stateDiagram-v2\n  [*] --> Ready\n  Ready --> [*]", "Ready", 1],
    ["sequenceDiagram\n  Alice->>Bob: Hello there\n  Bob-->>Alice: Ready", "Hello there", 1],
    ["classDiagram\n  class User\n  User : +String name", "String name", 2],
    ["erDiagram\n  CUSTOMER ||--o{ ORDER : places", "CUSTOMER", 1],
    ["gantt\n  title Project plan\n  section Plan\n  First task :a1, 2026-01-01, 3d", "First task", 3],
    ["xychart-beta\n  title \"Trend\"\n  x-axis [Jan, Feb, Mar]\n  line [20, 55, 80]", "Trend", 1],
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
