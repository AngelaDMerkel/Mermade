import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const { isFlowchartSource, requireFlowchartSource, FLOWCHART_TEMPLATE } = await loadTypeScript(new URL("../app/mermaid-types.ts", import.meta.url));

test("accepts flowchart, graph and flowchart-elk declarations after metadata", () => {
  assert.equal(isFlowchartSource(FLOWCHART_TEMPLATE), true);
  for (const declaration of ["flowchart LR", "graph TD", "flowchart-elk TB", "flowchart"]) {
    for (const prefix of ["", "%% comment\n", "---\ntitle: Example\n---\n%% comment\n", "\ufeff\r\n"]) {
      const source = `${prefix}${declaration}\n A --> B`;
      assert.equal(isFlowchartSource(source), true, source);
      assert.doesNotThrow(() => requireFlowchartSource(source));
    }
  }
});

test("rejects every removed chart declaration and does not detect flowchart text inside them", () => {
  for (const declaration of ["stateDiagram-v2", "classDiagram", "erDiagram", "requirementDiagram", "C4Context", "mindmap", "block-beta", "architecture-beta", "wardley-beta", "treeView-beta", "swimlane-beta", "sequenceDiagram", "journey", "gantt", "gitGraph", "timeline", "zenuml", "packet-beta", "kanban", "eventmodeling", "railroad-beta", "railroad-ebnf-beta", "railroad-abnf-beta", "railroad-peg-beta", "pie", "quadrantChart", "sankey-beta", "xychart-beta", "radar-beta", "treemap-beta", "venn-beta", "ishikawa-beta", "cynefin-beta", "flowcharts", ""]) {
    const source = `${declaration}\n%% flowchart LR`;
    assert.equal(isFlowchartSource(source), false, declaration);
    assert.throws(() => requireFlowchartSource(source), /supports flowcharts only/);
  }
});
