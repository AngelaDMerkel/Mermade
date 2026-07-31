import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeRegistry() {
  const source = await readFile(new URL("../app/mermaid-types.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("detects every supported Mermaid diagram family", async () => {
  const { MERMAID_DIAGRAM_TYPES, detectDiagramType, visualModeLabel } = await loadTypeRegistry();
  const fixtures = [
    ["flowchart", "flowchart LR", "FreeForm"],
    ["state", "stateDiagram-v2", "FreeForm"],
    ["class", "classDiagram", "FreeForm"],
    ["er", "erDiagram", "FreeForm"],
    ["requirement", "requirementDiagram", "FreeForm"],
    ["c4", "C4Context", "FreeForm"],
    ["mindmap", "mindmap", "FreeForm"],
    ["block", "block-beta", "FreeForm"],
    ["architecture", "architecture-beta", "FreeForm"],
    ["wardley", "wardley-beta", "FreeForm"],
    ["treeView", "treeView-beta", "FreeForm"],
    ["swimlane", "swimlane-beta", "Structured"],
    ["sequence", "sequenceDiagram", "Structured"],
    ["journey", "journey", "Structured"],
    ["gantt", "gantt", "Structured"],
    ["gitGraph", "gitGraph", "Structured"],
    ["timeline", "timeline", "Structured"],
    ["zenuml", "zenuml", "Structured"],
    ["packet", "packet-beta", "Structured"],
    ["kanban", "kanban", "Structured"],
    ["eventmodeling", "eventmodeling", "Structured"],
    ["railroad", "railroad-beta", "Structured"],
    ["railroadEbnf", "railroad-ebnf-beta", "Structured"],
    ["railroadAbnf", "railroad-abnf-beta", "Structured"],
    ["railroadPeg", "railroad-peg-beta", "Structured"],
    ["pie", "pie showData", "Data"],
    ["quadrantChart", "quadrantChart", "Data"],
    ["sankey", "sankey-beta", "Data"],
    ["xychart", "xychart-beta", "Data"],
    ["radar", "radar-beta", "Data"],
    ["treemap", "treemap-beta", "Data"],
    ["venn", "venn-beta", "Data"],
    ["ishikawa", "ishikawa-beta", "Data"],
    ["cynefin", "cynefin-beta", "Data"],
  ];

  assert.equal(MERMAID_DIAGRAM_TYPES.length, fixtures.length);
  for (const [id, declaration, mode] of fixtures) {
    const detected = detectDiagramType(`%% comment\n${declaration}\n`);
    assert.equal(detected?.id, id, declaration);
    assert.equal(visualModeLabel(detected.family), mode, declaration);
    assert.equal(detectDiagramType(detected.template)?.id, id, `${declaration} starter`);
  }
});

test("detects declarations after Mermaid YAML frontmatter", async () => {
  const { detectDiagramType } = await loadTypeRegistry();
  const detected = detectDiagramType("---\ntitle: Example\n---\nsequenceDiagram\n  A->>B: Hello");
  assert.equal(detected?.id, "sequence");
});
