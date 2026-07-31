import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("provides complete diagram-specific help for every Mermaid type", async () => {
  const [{ MERMAID_DIAGRAM_TYPES }, { MERMAID_HELP, helpForDiagram }] = await Promise.all([
    loadModule("../app/mermaid-types.ts"),
    loadModule("../app/mermaid-help.ts"),
  ]);

  const typeIds = MERMAID_DIAGRAM_TYPES.map((diagram) => diagram.id).sort();
  assert.deepEqual(Object.keys(MERMAID_HELP).sort(), typeIds);

  for (const diagram of MERMAID_DIAGRAM_TYPES) {
    const help = helpForDiagram(diagram.id);
    assert.ok(help.purpose.length >= 40, `${diagram.id} purpose`);
    assert.ok(help.tips.length >= 2, `${diagram.id} tips`);
    assert.ok(help.pitfalls.length >= 1, `${diagram.id} pitfalls`);
    assert.ok(help.resources.some((resource) => resource.kind === "Official syntax" && resource.url.startsWith("https://mermaid.js.org/")), `${diagram.id} Mermaid docs`);
    assert.ok(help.resources.some((resource) => resource.kind !== "Official syntax"), `${diagram.id} practice or standard reference`);
    for (const resource of help.resources) {
      assert.match(resource.url, /^https:\/\//, `${diagram.id}: ${resource.label}`);
      assert.ok(["Official syntax", "Standard", "Best practice", "Method guide"].includes(resource.kind));
    }
  }
});

test("keeps the requested ASQ flowchart reference", async () => {
  const { MERMAID_HELP } = await loadModule("../app/mermaid-help.ts");
  assert.ok(MERMAID_HELP.flowchart.resources.some((resource) => resource.url === "https://asq.org/quality-resources/flowchart"));
});
